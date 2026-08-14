#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, Env, Vec,
};

/// Unique stream identifier (auto-incremented).
pub type StreamId = u64;

/// Status of a payroll stream.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StreamStatus {
    Active,
    Paused,
    Cancelled,
    Completed,
}

/// Core stream data stored on-chain.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Stream {
    pub id: StreamId,
    pub employer: Address,
    pub employee: Address,
    pub token: Address,
    /// Tokens per second (scaled by 1e7 for precision).
    pub rate_per_second: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub total_funded: i128,
    pub withdrawn: i128,
    /// Last time a withdrawal checkpoint was taken.
    pub last_checkpoint: u64,
    pub status: StreamStatus,
    /// Accumulated seconds while paused (to offset accrual correctly).
    pub paused_duration: u64,
    /// Timestamp when the stream was last paused (0 if not paused).
    pub pause_start: u64,
}

/// Storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Next stream ID counter.
    NextId,
    /// Stream data by ID.
    Stream(StreamId),
    /// List of stream IDs for an employer.
    EmployerStreams(Address),
    /// List of stream IDs for an employee.
    EmployeeStreams(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum StreamError {
    /// Stream not found.
    NotFound = 1,
    /// Caller is not authorized for this action.
    Unauthorized = 2,
    /// Invalid parameters (e.g., end <= start, rate == 0).
    InvalidParams = 3,
    /// Insufficient funded amount to cover the full stream.
    InsufficientFunds = 4,
    /// Withdrawal amount exceeds accrued balance.
    ExceedsAccrued = 5,
    /// Stream is not active.
    NotActive = 6,
    /// Stream is not paused.
    NotPaused = 7,
    /// Overflow in arithmetic.
    Overflow = 8,
}

#[contract]
pub struct StreamContract;

#[contractimpl]
impl StreamContract {
    // ──────────────────────────────────────────────
    // Stream lifecycle
    // ──────────────────────────────────────────────

    /// Create and fund a new payroll stream.
    ///
    /// * `employer`        – address funding the stream (must authorize)
    /// * `employee`        – address receiving the stream
    /// * `token`           – SAC / token contract address
    /// * `rate_per_second`  – tokens per second to stream
    /// * `start_time`       – ledger-timestamp when accrual begins
    /// * `end_time`         – ledger-timestamp when stream ends
    pub fn create_stream(
        env: Env,
        employer: Address,
        employee: Address,
        token: Address,
        rate_per_second: i128,
        start_time: u64,
        end_time: u64,
    ) -> Result<StreamId, StreamError> {
        employer.require_auth();

        // Validate parameters.
        if end_time <= start_time {
            return Err(StreamError::InvalidParams);
        }
        if rate_per_second <= 0 {
            return Err(StreamError::InvalidParams);
        }

        let duration = (end_time - start_time) as i128;
        let total_funded = rate_per_second
            .checked_mul(duration)
            .ok_or(StreamError::Overflow)?;

        // Transfer tokens from employer to this contract.
        let contract_addr = env.current_contract_address();
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&employer, &contract_addr, &total_funded);

        // Allocate stream ID.
        let id: StreamId = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0_u64);
        env.storage()
            .instance()
            .set(&DataKey::NextId, &(id + 1));

        let stream = Stream {
            id,
            employer: employer.clone(),
            employee: employee.clone(),
            token,
            rate_per_second,
            start_time,
            end_time,
            total_funded,
            withdrawn: 0,
            last_checkpoint: start_time,
            status: StreamStatus::Active,
            paused_duration: 0,
            pause_start: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Stream(id), &stream);

        // Track stream in employer and employee lists.
        Self::push_stream_to_list(&env, &DataKey::EmployerStreams(employer), id);
        Self::push_stream_to_list(&env, &DataKey::EmployeeStreams(employee), id);

        // Extend TTL so data lives long enough.
        env.storage().persistent().extend_ttl(
            &DataKey::Stream(id),
            100_000,
            100_000,
        );
        env.storage().instance().extend_ttl(100_000, 100_000);

        Ok(id)
    }

    /// Compute the currently accrued-but-unwithdrawn balance for a stream.
    pub fn get_accrued(env: Env, stream_id: StreamId) -> Result<i128, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        Ok(Self::compute_accrued(&env, &stream))
    }

    /// Employee withdraws up to their accrued balance.
    pub fn withdraw(
        env: Env,
        employee: Address,
        stream_id: StreamId,
        amount: i128,
    ) -> Result<i128, StreamError> {
        employee.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if stream.employee != employee {
            return Err(StreamError::Unauthorized);
        }

        let accrued = Self::compute_accrued(&env, &stream);
        if amount > accrued {
            return Err(StreamError::ExceedsAccrued);
        }
        if amount <= 0 {
            return Err(StreamError::InvalidParams);
        }

        // Transfer tokens to employee.
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(
            &env.current_contract_address(),
            &employee,
            &amount,
        );

        stream.withdrawn = stream
            .withdrawn
            .checked_add(amount)
            .ok_or(StreamError::Overflow)?;

        // Update checkpoint to now.
        let now = env.ledger().timestamp();
        let effective_now = core::cmp::min(now, stream.end_time);
        stream.last_checkpoint = effective_now;

        // If fully withdrawn past end_time, mark completed.
        if now >= stream.end_time && stream.withdrawn >= stream.total_funded {
            stream.status = StreamStatus::Completed;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        Ok(amount)
    }

    /// Employer cancels a stream with pro-rata settlement.
    /// Employee gets all accrued; employer gets refunded the rest.
    pub fn cancel_stream(
        env: Env,
        employer: Address,
        stream_id: StreamId,
    ) -> Result<(i128, i128), StreamError> {
        employer.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if stream.employer != employer {
            return Err(StreamError::Unauthorized);
        }
        if stream.status == StreamStatus::Cancelled
            || stream.status == StreamStatus::Completed
        {
            return Err(StreamError::NotActive);
        }

        let accrued = Self::compute_accrued(&env, &stream);
        let employee_payout = accrued; // unwithdrawn accrued goes to employee
        let employer_refund = stream
            .total_funded
            .checked_sub(stream.withdrawn)
            .ok_or(StreamError::Overflow)?
            .checked_sub(employee_payout)
            .ok_or(StreamError::Overflow)?;

        let token_client = token::Client::new(&env, &stream.token);
        let contract_addr = env.current_contract_address();

        if employee_payout > 0 {
            token_client.transfer(&contract_addr, &stream.employee, &employee_payout);
        }
        if employer_refund > 0 {
            token_client.transfer(&contract_addr, &employer, &employer_refund);
        }

        stream.status = StreamStatus::Cancelled;
        stream.withdrawn = stream
            .withdrawn
            .checked_add(employee_payout)
            .ok_or(StreamError::Overflow)?;

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        Ok((employee_payout, employer_refund))
    }

    /// Employer pauses an active stream — accrual stops.
    pub fn pause_stream(
        env: Env,
        employer: Address,
        stream_id: StreamId,
    ) -> Result<(), StreamError> {
        employer.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if stream.employer != employer {
            return Err(StreamError::Unauthorized);
        }
        if stream.status != StreamStatus::Active {
            return Err(StreamError::NotActive);
        }

        let now = env.ledger().timestamp();
        stream.status = StreamStatus::Paused;
        stream.pause_start = now;

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        Ok(())
    }

    /// Employer resumes a paused stream.
    pub fn resume_stream(
        env: Env,
        employer: Address,
        stream_id: StreamId,
    ) -> Result<(), StreamError> {
        employer.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if stream.employer != employer {
            return Err(StreamError::Unauthorized);
        }
        if stream.status != StreamStatus::Paused {
            return Err(StreamError::NotPaused);
        }

        let now = env.ledger().timestamp();
        let pause_elapsed = now.saturating_sub(stream.pause_start);
        stream.paused_duration = stream.paused_duration.saturating_add(pause_elapsed);
        stream.status = StreamStatus::Active;
        stream.pause_start = 0;

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        Ok(())
    }

    /// Employer tops up an existing stream (extends total_funded, keeping rate).
    pub fn top_up(
        env: Env,
        employer: Address,
        stream_id: StreamId,
        amount: i128,
    ) -> Result<(), StreamError> {
        employer.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if stream.employer != employer {
            return Err(StreamError::Unauthorized);
        }
        if amount <= 0 {
            return Err(StreamError::InvalidParams);
        }

        // Transfer additional tokens.
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(
            &employer,
            &env.current_contract_address(),
            &amount,
        );

        stream.total_funded = stream
            .total_funded
            .checked_add(amount)
            .ok_or(StreamError::Overflow)?;

        // Extend end_time proportionally.
        let extra_seconds = amount
            .checked_div(stream.rate_per_second)
            .ok_or(StreamError::Overflow)? as u64;
        stream.end_time = stream.end_time.saturating_add(extra_seconds);

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        Ok(())
    }

    // ──────────────────────────────────────────────
    // Queries
    // ──────────────────────────────────────────────

    /// Get full stream details.
    pub fn get_stream(env: Env, stream_id: StreamId) -> Result<Stream, StreamError> {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)
    }

    /// List all stream IDs for an employer.
    pub fn get_employer_streams(env: Env, employer: Address) -> Vec<StreamId> {
        env.storage()
            .persistent()
            .get(&DataKey::EmployerStreams(employer))
            .unwrap_or(Vec::new(&env))
    }

    /// List all stream IDs for an employee.
    pub fn get_employee_streams(env: Env, employee: Address) -> Vec<StreamId> {
        env.storage()
            .persistent()
            .get(&DataKey::EmployeeStreams(employee))
            .unwrap_or(Vec::new(&env))
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    /// Compute the accrued-but-unwithdrawn balance at the current ledger time.
    ///
    /// accrued = rate × (effective_elapsed - paused_duration) - withdrawn
    ///
    /// where effective_elapsed = min(now, end_time) - start_time
    fn compute_accrued(env: &Env, stream: &Stream) -> i128 {
        if stream.status == StreamStatus::Cancelled
            || stream.status == StreamStatus::Completed
        {
            return 0;
        }

        let now = env.ledger().timestamp();
        let effective_end = core::cmp::min(now, stream.end_time);

        if effective_end <= stream.start_time {
            return 0;
        }

        let elapsed = effective_end - stream.start_time;

        // If currently paused, add the ongoing pause to paused_duration for calculation.
        let total_paused = if stream.status == StreamStatus::Paused && stream.pause_start > 0 {
            let current_pause = now.saturating_sub(stream.pause_start);
            stream.paused_duration.saturating_add(current_pause)
        } else {
            stream.paused_duration
        };

        let active_seconds = elapsed.saturating_sub(total_paused);

        let total_accrued = stream.rate_per_second * (active_seconds as i128);
        let unwithdrawn = total_accrued - stream.withdrawn;

        // Clamp: cannot exceed remaining funded amount.
        let remaining = stream.total_funded - stream.withdrawn;
        core::cmp::min(unwithdrawn, remaining).max(0)
    }

    /// Push a stream ID to a persistent list (employer or employee index).
    fn push_stream_to_list(env: &Env, key: &DataKey, stream_id: StreamId) {
        let mut list: Vec<StreamId> = env
            .storage()
            .persistent()
            .get(key)
            .unwrap_or(Vec::new(env));
        list.push_back(stream_id);
        env.storage().persistent().set(key, &list);
        env.storage().persistent().extend_ttl(key, 100_000, 100_000);
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

    fn setup_test() -> (Env, Address, Address, Address, StreamContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(StreamContract, ());
        let client = StreamContractClient::new(&env, &contract_id);

        let employer = Address::generate(&env);
        let employee = Address::generate(&env);

        // Create a test token.
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_contract.address();
        let token_admin_client = StellarAssetClient::new(&env, &token_addr);

        // Mint tokens to employer.
        token_admin_client.mint(&employer, &1_000_000_000);

        // Leak env to get 'static lifetime for client.
        let env = Box::leak(Box::new(env));
        let client = StreamContractClient::new(env, &contract_id);

        (env.clone(), employer, employee, token_addr, client)
    }

    #[test]
    fn test_create_and_accrue() {
        let (env, employer, employee, token, client) = setup_test();

        // Set ledger time.
        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(
            &employer,
            &employee,
            &token,
            &100_i128, // 100 tokens/sec
            &1000_u64, // start now
            &2000_u64, // end in 1000 seconds
        );

        assert_eq!(stream_id, 0);

        // Advance 500 seconds.
        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });

        let accrued = client.get_accrued(&stream_id);
        assert_eq!(accrued, 50_000); // 500 * 100
    }

    #[test]
    fn test_withdraw() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(
            &employer, &employee, &token, &100, &1000, &2000,
        );

        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });

        // Withdraw 30000 of 50000 accrued.
        let withdrawn = client.withdraw(&employee, &stream_id, &30_000_i128);
        assert_eq!(withdrawn, 30_000);

        // Check employee token balance.
        let token_client = TokenClient::new(&env, &token);
        assert_eq!(token_client.balance(&employee), 30_000);

        // Remaining accrued should be 20_000.
        let accrued = client.get_accrued(&stream_id);
        // After withdrawal, checkpoint is updated to 1500.
        // Since we just withdrew at t=1500 and are still at t=1500, accrued = 0 newly + (50000 - 30000) carried = ...
        // Actually, the compute_accrued recalculates from start_time:
        // total_accrued = 100 * (1500 - 1000) = 50000, minus withdrawn=30000 = 20000
        assert_eq!(accrued, 20_000);
    }

    #[test]
    fn test_cancel_with_settlement() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(
            &employer, &employee, &token, &100, &1000, &2000,
        );

        let token_client = TokenClient::new(&env, &token);
        let employer_before = token_client.balance(&employer);

        // Advance 300 seconds → 30000 accrued.
        env.ledger().with_mut(|li| {
            li.timestamp = 1300;
        });

        let (emp_payout, empr_refund) = client.cancel_stream(&employer, &stream_id);

        // Employee should get 30000 (300 * 100).
        assert_eq!(emp_payout, 30_000);
        // Employer refund = 100000 - 30000 = 70000.
        assert_eq!(empr_refund, 70_000);

        assert_eq!(token_client.balance(&employee), 30_000);
        assert_eq!(token_client.balance(&employer), employer_before + 70_000);
    }

    #[test]
    fn test_pause_and_resume() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(
            &employer, &employee, &token, &100, &1000, &2000,
        );

        // Advance 200s, then pause.
        env.ledger().with_mut(|li| {
            li.timestamp = 1200;
        });
        client.pause_stream(&employer, &stream_id);

        // Advance 300s while paused — should NOT accrue.
        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });
        let accrued_while_paused = client.get_accrued(&stream_id);
        assert_eq!(accrued_while_paused, 20_000); // Only 200s * 100

        // Resume.
        client.resume_stream(&employer, &stream_id);

        // Advance another 100s — should accrue 100*100 more.
        env.ledger().with_mut(|li| {
            li.timestamp = 1600;
        });
        let accrued_after_resume = client.get_accrued(&stream_id);
        assert_eq!(accrued_after_resume, 30_000); // 200 + 100 active seconds
    }

    #[test]
    fn test_top_up() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(
            &employer, &employee, &token, &100, &1000, &2000,
        );

        // Top up with 50000 more tokens.
        client.top_up(&employer, &stream_id, &50_000_i128);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.total_funded, 150_000); // 100000 + 50000
        assert_eq!(stream.end_time, 2500); // 2000 + 50000/100
    }

    #[test]
    fn test_employer_employee_stream_lists() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let id1 = client.create_stream(
            &employer, &employee, &token, &100, &1000, &2000,
        );
        let id2 = client.create_stream(
            &employer, &employee, &token, &50, &1000, &3000,
        );

        let employer_streams = client.get_employer_streams(&employer);
        assert_eq!(employer_streams.len(), 2);
        assert_eq!(employer_streams.get(0).unwrap(), id1);
        assert_eq!(employer_streams.get(1).unwrap(), id2);

        let employee_streams = client.get_employee_streams(&employee);
        assert_eq!(employee_streams.len(), 2);
    }

    #[test]
    #[should_panic]
    fn test_withdraw_exceeds_accrued() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(
            &employer, &employee, &token, &100, &1000, &2000,
        );

        env.ledger().with_mut(|li| {
            li.timestamp = 1100;
        });

        // Try to withdraw 20000 when only 10000 accrued — should panic.
        client.withdraw(&employee, &stream_id, &20_000_i128);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_withdraw() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(
            &employer, &employee, &token, &100, &1000, &2000,
        );

        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });

        // Employer tries to withdraw from employee's stream — should panic.
        client.withdraw(&employer, &stream_id, &10_000_i128);
    }
}
