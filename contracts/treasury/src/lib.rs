#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, Env, Vec,
};

pub type TreasuryId = u64;

/// Treasury data — pooled employer funds.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Treasury {
    pub id: TreasuryId,
    pub employer: Address,
    pub token: Address,
    pub balance: i128,
    pub allocated: i128,
    pub stream_ids: Vec<u64>,
}

/// Storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextId,
    Treasury(TreasuryId),
    EmployerTreasury(Address),
    StreamContract,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum TreasuryError {
    NotFound = 1,
    Unauthorized = 2,
    InvalidParams = 3,
    InsufficientBalance = 4,
    Overflow = 5,
    AlreadyInitialized = 6,
}

#[contract]
pub struct TreasuryContract;

#[contractimpl]
impl TreasuryContract {
    /// Initialize the treasury contract with the stream contract address.
    pub fn initialize(
        env: Env,
        admin: Address,
        stream_contract: Address,
    ) -> Result<(), TreasuryError> {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::StreamContract) {
            return Err(TreasuryError::AlreadyInitialized);
        }

        env.storage()
            .instance()
            .set(&DataKey::StreamContract, &stream_contract);
        env.storage().instance().extend_ttl(100_000, 100_000);

        Ok(())
    }

    /// Create a new treasury for an employer.
    pub fn create_treasury(
        env: Env,
        employer: Address,
        token: Address,
    ) -> Result<TreasuryId, TreasuryError> {
        employer.require_auth();

        let id: TreasuryId = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0_u64);

        env.storage()
            .instance()
            .set(&DataKey::NextId, &(id + 1));

        let treasury = Treasury {
            id,
            employer: employer.clone(),
            token,
            balance: 0,
            allocated: 0,
            stream_ids: Vec::new(&env),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Treasury(id), &treasury);
        env.storage()
            .persistent()
            .set(&DataKey::EmployerTreasury(employer), &id);

        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Treasury(id), 100_000, 100_000);
        env.storage().instance().extend_ttl(100_000, 100_000);

        Ok(id)
    }

    /// Employer deposits funds into their treasury.
    pub fn deposit(
        env: Env,
        employer: Address,
        treasury_id: TreasuryId,
        amount: i128,
    ) -> Result<i128, TreasuryError> {
        employer.require_auth();

        let mut treasury: Treasury = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury(treasury_id))
            .ok_or(TreasuryError::NotFound)?;

        if treasury.employer != employer {
            return Err(TreasuryError::Unauthorized);
        }
        if amount <= 0 {
            return Err(TreasuryError::InvalidParams);
        }

        // Transfer tokens from employer to this contract.
        let token_client = token::Client::new(&env, &treasury.token);
        token_client.transfer(&employer, &env.current_contract_address(), &amount);

        treasury.balance = treasury
            .balance
            .checked_add(amount)
            .ok_or(TreasuryError::Overflow)?;

        env.storage()
            .persistent()
            .set(&DataKey::Treasury(treasury_id), &treasury);

        Ok(treasury.balance)
    }

    /// Employer withdraws unallocated funds from treasury.
    pub fn withdraw_from_treasury(
        env: Env,
        employer: Address,
        treasury_id: TreasuryId,
        amount: i128,
    ) -> Result<i128, TreasuryError> {
        employer.require_auth();

        let mut treasury: Treasury = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury(treasury_id))
            .ok_or(TreasuryError::NotFound)?;

        if treasury.employer != employer {
            return Err(TreasuryError::Unauthorized);
        }

        let available = treasury.balance - treasury.allocated;
        if amount > available {
            return Err(TreasuryError::InsufficientBalance);
        }

        let token_client = token::Client::new(&env, &treasury.token);
        token_client.transfer(&env.current_contract_address(), &employer, &amount);

        treasury.balance = treasury
            .balance
            .checked_sub(amount)
            .ok_or(TreasuryError::Overflow)?;

        env.storage()
            .persistent()
            .set(&DataKey::Treasury(treasury_id), &treasury);

        Ok(treasury.balance)
    }

    /// Allocate funds from treasury for a stream (tracked but actual stream
    /// creation happens via the stream contract).
    pub fn allocate_for_stream(
        env: Env,
        employer: Address,
        treasury_id: TreasuryId,
        stream_id: u64,
        amount: i128,
    ) -> Result<(), TreasuryError> {
        employer.require_auth();

        let mut treasury: Treasury = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury(treasury_id))
            .ok_or(TreasuryError::NotFound)?;

        if treasury.employer != employer {
            return Err(TreasuryError::Unauthorized);
        }

        let available = treasury.balance - treasury.allocated;
        if amount > available {
            return Err(TreasuryError::InsufficientBalance);
        }

        treasury.allocated = treasury
            .allocated
            .checked_add(amount)
            .ok_or(TreasuryError::Overflow)?;

        treasury.stream_ids.push_back(stream_id);

        env.storage()
            .persistent()
            .set(&DataKey::Treasury(treasury_id), &treasury);

        Ok(())
    }

    /// Release allocation when a stream completes or is cancelled.
    pub fn release_allocation(
        env: Env,
        employer: Address,
        treasury_id: TreasuryId,
        amount: i128,
    ) -> Result<(), TreasuryError> {
        employer.require_auth();

        let mut treasury: Treasury = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury(treasury_id))
            .ok_or(TreasuryError::NotFound)?;

        if treasury.employer != employer {
            return Err(TreasuryError::Unauthorized);
        }

        treasury.allocated = treasury
            .allocated
            .checked_sub(amount)
            .ok_or(TreasuryError::Overflow)?;

        env.storage()
            .persistent()
            .set(&DataKey::Treasury(treasury_id), &treasury);

        Ok(())
    }

    // ──────────────────────────────────────────────
    // Queries
    // ──────────────────────────────────────────────

    /// Get treasury details.
    pub fn get_treasury(env: Env, treasury_id: TreasuryId) -> Result<Treasury, TreasuryError> {
        env.storage()
            .persistent()
            .get(&DataKey::Treasury(treasury_id))
            .ok_or(TreasuryError::NotFound)
    }

    /// Get available (unallocated) balance.
    pub fn get_available_balance(
        env: Env,
        treasury_id: TreasuryId,
    ) -> Result<i128, TreasuryError> {
        let treasury: Treasury = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury(treasury_id))
            .ok_or(TreasuryError::NotFound)?;

        Ok(treasury.balance - treasury.allocated)
    }

    /// Get treasury ID for an employer.
    pub fn get_employer_treasury(
        env: Env,
        employer: Address,
    ) -> Result<TreasuryId, TreasuryError> {
        env.storage()
            .persistent()
            .get(&DataKey::EmployerTreasury(employer))
            .ok_or(TreasuryError::NotFound)
    }

    /// Get stream contract address.
    pub fn get_stream_contract(env: Env) -> Result<Address, TreasuryError> {
        env.storage()
            .instance()
            .get(&DataKey::StreamContract)
            .ok_or(TreasuryError::NotFound)
    }
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

#[cfg(test)]
mod test {
    extern crate std;
    use std::boxed::Box;
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{StellarAssetClient, TokenClient},
        Env,
    };

    fn setup_test() -> (Env, Address, Address, TreasuryContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(TreasuryContract, ());
        let client = TreasuryContractClient::new(&env, &contract_id);

        let employer = Address::generate(&env);

        // Create a test token.
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_contract.address();
        let token_admin_client = StellarAssetClient::new(&env, &token_addr);
        token_admin_client.mint(&employer, &10_000_000_000);

        let env = Box::leak(Box::new(env));
        let client = TreasuryContractClient::new(env, &contract_id);

        (env.clone(), employer, token_addr, client)
    }

    #[test]
    fn test_create_treasury() {
        let (_env, employer, token, client) = setup_test();

        let id = client.create_treasury(&employer, &token);
        assert_eq!(id, 0);

        let treasury = client.get_treasury(&id);
        assert_eq!(treasury.employer, employer);
        assert_eq!(treasury.balance, 0);
    }

    #[test]
    fn test_deposit_and_withdraw() {
        let (env, employer, token, client) = setup_test();

        let id = client.create_treasury(&employer, &token);

        // Deposit.
        let new_balance = client.deposit(&employer, &id, &500_000);
        assert_eq!(new_balance, 500_000);

        // Withdraw.
        let after_withdraw = client.withdraw_from_treasury(&employer, &id, &200_000);
        assert_eq!(after_withdraw, 300_000);

        let token_client = TokenClient::new(&env, &token);
        let employer_balance = token_client.balance(&employer);
        assert_eq!(employer_balance, 10_000_000_000 - 300_000);
    }

    #[test]
    fn test_allocate_and_release() {
        let (_env, employer, token, client) = setup_test();

        let id = client.create_treasury(&employer, &token);
        client.deposit(&employer, &id, &1_000_000);

        // Allocate for a stream.
        client.allocate_for_stream(&employer, &id, &0_u64, &400_000);

        let available = client.get_available_balance(&id);
        assert_eq!(available, 600_000);

        // Release allocation.
        client.release_allocation(&employer, &id, &400_000);

        let available_after = client.get_available_balance(&id);
        assert_eq!(available_after, 1_000_000);
    }

    #[test]
    #[should_panic]
    fn test_over_allocation() {
        let (_env, employer, token, client) = setup_test();

        let id = client.create_treasury(&employer, &token);
        client.deposit(&employer, &id, &100_000);

        // Try to allocate more than available — should panic.
        client.allocate_for_stream(&employer, &id, &0_u64, &200_000);
    }
}
