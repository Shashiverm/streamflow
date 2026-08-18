#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Vec,
};

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
    pub id: u64,
    pub employer: Address,
    pub employee: Address,
    pub token: Address,
    pub rate_per_second: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub cliff_time: u64,
    pub total_funded: i128,
    pub withdrawn: i128,
    pub last_checkpoint: u64,
    pub status: StreamStatus,
    pub paused_duration: u64,
    pub pause_start: u64,
}

/// Storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    NextId,
    Stream(u64),
    EmployerStreams(Address),
    EmployeeStreams(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum StreamError {
    NotFound = 1,
    Unauthorized = 2,
    InvalidParams = 3,
    InsufficientFunds = 4,
    ExceedsAccrued = 5,
    NotActive = 6,
    NotPaused = 7,
    Overflow = 8,
    ArrayLengthMismatch = 9,
}

#[contract]
pub struct StreamContract;

#[contractimpl]
impl StreamContract {
    // ──────────────────────────────────────────────
    // Stream Lifecycle & Creation
    // ──────────────────────────────────────────────

    /// Create and fund a standard payroll stream without a cliff.
    pub fn create_stream(
        env: Env,
        employer: Address,
        employee: Address,
        token: Address,
        rate_per_second: i128,
        start_time: u64,
        end_time: u64,
    ) -> Result<u64, StreamError> {
        Self::create_stream_with_cliff(
            env,
            employer,
            employee,
            token,
            rate_per_second,
            start_time,
            end_time,
            0,
        )
    }

    /// Create and fund a new stream with an optional vesting cliff.
    pub fn create_stream_with_cliff(
        env: Env,
        employer: Address,
        employee: Address,
        token: Address,
        rate_per_second: i128,
        start_time: u64,
        end_time: u64,
        cliff_time: u64,
    ) -> Result<u64, StreamError> {
        employer.require_auth();

        if end_time <= start_time || rate_per_second <= 0 || cliff_time > end_time {
            return Err(StreamError::InvalidParams);
        }

        let duration = (end_time - start_time) as i128;
        let total_funded = rate_per_second
            .checked_mul(duration)
            .ok_or(StreamError::Overflow)?;

        let contract_addr = env.current_contract_address();
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&employer, &contract_addr, &total_funded);

        let id = Self::internal_create_stream(
            &env,
            employer.clone(),
            employee.clone(),
            token.clone(),
            rate_per_second,
            start_time,
            end_time,
            cliff_time,
            total_funded,
        )?;

        env.events().publish(
            (symbol_short!("create"), employer, employee),
            (id, token, rate_per_second, total_funded, cliff_time),
        );

        Ok(id)
    }

    /// Enterprise Batch Creation: create multiple streams in a single atomic transaction.
    pub fn batch_create_streams(
        env: Env,
        employer: Address,
        employees: Vec<Address>,
        token: Address,
        rates: Vec<i128>,
        start_times: Vec<u64>,
        end_times: Vec<u64>,
        cliff_times: Vec<u64>,
    ) -> Result<Vec<u64>, StreamError> {
        employer.require_auth();

        let count = employees.len();
        if count == 0
            || rates.len() != count
            || start_times.len() != count
            || end_times.len() != count
            || cliff_times.len() != count
        {
            return Err(StreamError::ArrayLengthMismatch);
        }

        let mut total_batch_funding: i128 = 0;
        for i in 0..count {
            let s_time = start_times.get(i).unwrap();
            let e_time = end_times.get(i).unwrap();
            let rate = rates.get(i).unwrap();
            let c_time = cliff_times.get(i).unwrap();

            if e_time <= s_time || rate <= 0 || c_time > e_time {
                return Err(StreamError::InvalidParams);
            }

            let dur = (e_time - s_time) as i128;
            let funded = rate.checked_mul(dur).ok_or(StreamError::Overflow)?;
            total_batch_funding = total_batch_funding
                .checked_add(funded)
                .ok_or(StreamError::Overflow)?;
        }

        let contract_addr = env.current_contract_address();
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&employer, &contract_addr, &total_batch_funding);

        let mut created_ids = Vec::new(&env);
        for i in 0..count {
            let emp = employees.get(i).unwrap();
            let s_time = start_times.get(i).unwrap();
            let e_time = end_times.get(i).unwrap();
            let rate = rates.get(i).unwrap();
            let c_time = cliff_times.get(i).unwrap();
            let funded = rate * ((e_time - s_time) as i128);

            let id = Self::internal_create_stream(
                &env,
                employer.clone(),
                emp.clone(),
                token.clone(),
                rate,
                s_time,
                e_time,
                c_time,
                funded,
            )?;
            created_ids.push_back(id);

            env.events().publish(
                (symbol_short!("create"), employer.clone(), emp),
                (id, token.clone(), rate, funded, c_time),
            );
        }

        Ok(created_ids)
    }

    // ──────────────────────────────────────────────
    // Withdrawals & Settlement
    // ──────────────────────────────────────────────

    /// Employee withdraws up to their accrued balance.
    pub fn withdraw(
        env: Env,
        employee: Address,
        stream_id: u64,
        amount: i128,
    ) -> Result<i128, StreamError> {
        employee.require_auth();
        Self::internal_withdraw(&env, &employee, stream_id, amount)
    }

    /// Batch Withdraw: Employee withdraws from multiple streams in a single call.
    pub fn batch_withdraw(
        env: Env,
        employee: Address,
        stream_ids: Vec<u64>,
        amounts: Vec<i128>,
    ) -> Result<i128, StreamError> {
        employee.require_auth();

        let count = stream_ids.len();
        if count == 0 || amounts.len() != count {
            return Err(StreamError::ArrayLengthMismatch);
        }

        let mut total_withdrawn: i128 = 0;
        for i in 0..count {
            let s_id = stream_ids.get(i).unwrap();
            let amt = amounts.get(i).unwrap();
            if amt > 0 {
                let actual = Self::internal_withdraw(&env, &employee, s_id, amt)?;
                total_withdrawn = total_withdrawn
                    .checked_add(actual)
                    .ok_or(StreamError::Overflow)?;
            }
        }

        Ok(total_withdrawn)
    }

    /// Employer cancels a stream with pro-rata settlement.
    pub fn cancel_stream(
        env: Env,
        employer: Address,
        stream_id: u64,
    ) -> Result<(i128, i128), StreamError> {
        employer.require_auth();
        Self::internal_cancel(&env, &employer, stream_id)
    }

    /// Batch Cancel: Employer cancels multiple streams in one transaction.
    pub fn batch_cancel_streams(
        env: Env,
        employer: Address,
        stream_ids: Vec<u64>,
    ) -> Result<(i128, i128), StreamError> {
        employer.require_auth();

        let mut total_payout: i128 = 0;
        let mut total_refund: i128 = 0;

        for i in 0..stream_ids.len() {
            let s_id = stream_ids.get(i).unwrap();
            let (emp_pay, empr_ref) = Self::internal_cancel(&env, &employer, s_id)?;
            total_payout = total_payout
                .checked_add(emp_pay)
                .ok_or(StreamError::Overflow)?;
            total_refund = total_refund
                .checked_add(empr_ref)
                .ok_or(StreamError::Overflow)?;
        }

        Ok((total_payout, total_refund))
    }

    // ──────────────────────────────────────────────
    // Pause / Resume / Top Up / Transfer
    // ──────────────────────────────────────────────

    /// Employer pauses an active stream.
    pub fn pause_stream(env: Env, employer: Address, stream_id: u64) -> Result<(), StreamError> {
        employer.require_auth();
        Self::internal_pause(&env, &employer, stream_id)
    }

    /// Batch Pause: Pause multiple streams in a single call.
    pub fn batch_pause_streams(
        env: Env,
        employer: Address,
        stream_ids: Vec<u64>,
    ) -> Result<(), StreamError> {
        employer.require_auth();
        for i in 0..stream_ids.len() {
            let s_id = stream_ids.get(i).unwrap();
            Self::internal_pause(&env, &employer, s_id)?;
        }
        Ok(())
    }

    /// Employer resumes a paused stream.
    pub fn resume_stream(env: Env, employer: Address, stream_id: u64) -> Result<(), StreamError> {
        employer.require_auth();
        Self::internal_resume(&env, &employer, stream_id)
    }

    /// Batch Resume: Resume multiple streams in a single call.
    pub fn batch_resume_streams(
        env: Env,
        employer: Address,
        stream_ids: Vec<u64>,
    ) -> Result<(), StreamError> {
        employer.require_auth();
        for i in 0..stream_ids.len() {
            let s_id = stream_ids.get(i).unwrap();
            Self::internal_resume(&env, &employer, s_id)?;
        }
        Ok(())
    }

    /// Employer tops up an existing stream.
    pub fn top_up(
        env: Env,
        employer: Address,
        stream_id: u64,
        amount: i128,
    ) -> Result<(), StreamError> {
        employer.require_auth();
        Self::internal_top_up(&env, &employer, stream_id, amount)
    }

    /// Batch Top Up: Top up multiple streams.
    pub fn batch_top_up(
        env: Env,
        employer: Address,
        stream_ids: Vec<u64>,
        amounts: Vec<i128>,
    ) -> Result<(), StreamError> {
        employer.require_auth();
        let count = stream_ids.len();
        if count == 0 || amounts.len() != count {
            return Err(StreamError::ArrayLengthMismatch);
        }

        for i in 0..count {
            let s_id = stream_ids.get(i).unwrap();
            let amt = amounts.get(i).unwrap();
            if amt > 0 {
                Self::internal_top_up(&env, &employer, s_id, amt)?;
            }
        }
        Ok(())
    }

    /// Wallet Migration: Employee transfers future stream accrual to a new address.
    pub fn transfer_recipient(
        env: Env,
        employee: Address,
        stream_id: u64,
        new_employee: Address,
    ) -> Result<(), StreamError> {
        employee.require_auth();

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if stream.employee != employee {
            return Err(StreamError::Unauthorized);
        }
        if stream.status == StreamStatus::Cancelled || stream.status == StreamStatus::Completed {
            return Err(StreamError::NotActive);
        }

        stream.employee = new_employee.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        Self::push_stream_to_list(&env, &DataKey::EmployeeStreams(new_employee.clone()), stream_id);

        env.events().publish(
            (symbol_short!("transfer"), employee, new_employee),
            stream_id,
        );

        Ok(())
    }

    // ──────────────────────────────────────────────
    // Scalable Queries & Pagination
    // ──────────────────────────────────────────────

    pub fn get_stream(env: Env, stream_id: u64) -> Result<Stream, StreamError> {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)
    }

    pub fn get_accrued(env: Env, stream_id: u64) -> Result<i128, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        Ok(Self::compute_accrued(&env, &stream))
    }

    pub fn get_employer_stream_count(env: Env, employer: Address) -> u32 {
        let list: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EmployerStreams(employer))
            .unwrap_or(Vec::new(&env));
        list.len()
    }

    pub fn get_employee_stream_count(env: Env, employee: Address) -> u32 {
        let list: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EmployeeStreams(employee))
            .unwrap_or(Vec::new(&env));
        list.len()
    }

    pub fn get_employer_streams_paginated(
        env: Env,
        employer: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<u64> {
        let list: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EmployerStreams(employer))
            .unwrap_or(Vec::new(&env));

        let total = list.len();
        let mut result = Vec::new(&env);
        if offset >= total || limit == 0 {
            return result;
        }

        let end = core::cmp::min(offset + limit, total);
        for i in offset..end {
            result.push_back(list.get(i).unwrap());
        }
        result
    }

    pub fn get_employee_streams_paginated(
        env: Env,
        employee: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<u64> {
        let list: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EmployeeStreams(employee))
            .unwrap_or(Vec::new(&env));

        let total = list.len();
        let mut result = Vec::new(&env);
        if offset >= total || limit == 0 {
            return result;
        }

        let end = core::cmp::min(offset + limit, total);
        for i in offset..end {
            result.push_back(list.get(i).unwrap());
        }
        result
    }

    pub fn get_employer_streams(env: Env, employer: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::EmployerStreams(employer))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_employee_streams(env: Env, employee: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::EmployeeStreams(employee))
            .unwrap_or(Vec::new(&env))
    }

    // ──────────────────────────────────────────────
    // Internal Helpers
    // ──────────────────────────────────────────────

    fn internal_withdraw(
        env: &Env,
        employee: &Address,
        stream_id: u64,
        amount: i128,
    ) -> Result<i128, StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if &stream.employee != employee {
            return Err(StreamError::Unauthorized);
        }

        let accrued = Self::compute_accrued(env, &stream);
        if amount > accrued {
            return Err(StreamError::ExceedsAccrued);
        }
        if amount <= 0 {
            return Err(StreamError::InvalidParams);
        }

        let token_client = token::Client::new(env, &stream.token);
        token_client.transfer(&env.current_contract_address(), employee, &amount);

        stream.withdrawn = stream
            .withdrawn
            .checked_add(amount)
            .ok_or(StreamError::Overflow)?;

        let now = env.ledger().timestamp();
        let effective_now = core::cmp::min(now, stream.end_time);
        stream.last_checkpoint = effective_now;

        if now >= stream.end_time && stream.withdrawn >= stream.total_funded {
            stream.status = StreamStatus::Completed;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        env.events().publish(
            (symbol_short!("withdraw"), employee.clone()),
            (stream_id, amount, stream.withdrawn),
        );

        Ok(amount)
    }

    fn internal_cancel(
        env: &Env,
        employer: &Address,
        stream_id: u64,
    ) -> Result<(i128, i128), StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if &stream.employer != employer {
            return Err(StreamError::Unauthorized);
        }
        if stream.status == StreamStatus::Cancelled || stream.status == StreamStatus::Completed {
            return Err(StreamError::NotActive);
        }

        let accrued = Self::compute_accrued(env, &stream);
        let employee_payout = accrued;
        let employer_refund = stream
            .total_funded
            .checked_sub(stream.withdrawn)
            .ok_or(StreamError::Overflow)?
            .checked_sub(employee_payout)
            .ok_or(StreamError::Overflow)?;

        let token_client = token::Client::new(env, &stream.token);
        let contract_addr = env.current_contract_address();

        if employee_payout > 0 {
            token_client.transfer(&contract_addr, &stream.employee, &employee_payout);
        }
        if employer_refund > 0 {
            token_client.transfer(&contract_addr, employer, &employer_refund);
        }

        stream.status = StreamStatus::Cancelled;
        stream.withdrawn = stream
            .withdrawn
            .checked_add(employee_payout)
            .ok_or(StreamError::Overflow)?;

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        env.events().publish(
            (symbol_short!("cancel"), employer.clone()),
            (stream_id, employee_payout, employer_refund),
        );

        Ok((employee_payout, employer_refund))
    }

    fn internal_pause(
        env: &Env,
        employer: &Address,
        stream_id: u64,
    ) -> Result<(), StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if &stream.employer != employer {
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

        env.events().publish(
            (symbol_short!("pause"), employer.clone()),
            stream_id,
        );

        Ok(())
    }

    fn internal_resume(
        env: &Env,
        employer: &Address,
        stream_id: u64,
    ) -> Result<(), StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if &stream.employer != employer {
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

        env.events().publish(
            (symbol_short!("resume"), employer.clone()),
            stream_id,
        );

        Ok(())
    }

    fn internal_top_up(
        env: &Env,
        employer: &Address,
        stream_id: u64,
        amount: i128,
    ) -> Result<(), StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;

        if &stream.employer != employer {
            return Err(StreamError::Unauthorized);
        }
        if amount <= 0 {
            return Err(StreamError::InvalidParams);
        }

        let token_client = token::Client::new(env, &stream.token);
        token_client.transfer(employer, &env.current_contract_address(), &amount);

        stream.total_funded = stream
            .total_funded
            .checked_add(amount)
            .ok_or(StreamError::Overflow)?;

        let extra_seconds = amount
            .checked_div(stream.rate_per_second)
            .ok_or(StreamError::Overflow)? as u64;
        stream.end_time = stream.end_time.saturating_add(extra_seconds);

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        env.events().publish(
            (symbol_short!("topup"), employer.clone()),
            (stream_id, amount, stream.total_funded, stream.end_time),
        );

        Ok(())
    }

    fn internal_create_stream(
        env: &Env,
        employer: Address,
        employee: Address,
        token: Address,
        rate_per_second: i128,
        start_time: u64,
        end_time: u64,
        cliff_time: u64,
        total_funded: i128,
    ) -> Result<u64, StreamError> {
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0_u64);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let stream = Stream {
            id,
            employer: employer.clone(),
            employee: employee.clone(),
            token,
            rate_per_second,
            start_time,
            end_time,
            cliff_time,
            total_funded,
            withdrawn: 0,
            last_checkpoint: start_time,
            status: StreamStatus::Active,
            paused_duration: 0,
            pause_start: 0,
        };

        env.storage().persistent().set(&DataKey::Stream(id), &stream);
        Self::push_stream_to_list(env, &DataKey::EmployerStreams(employer), id);
        Self::push_stream_to_list(env, &DataKey::EmployeeStreams(employee), id);

        env.storage().persistent().extend_ttl(&DataKey::Stream(id), 100_000, 100_000);
        env.storage().instance().extend_ttl(100_000, 100_000);

        Ok(id)
    }

    fn compute_accrued(env: &Env, stream: &Stream) -> i128 {
        if stream.status == StreamStatus::Cancelled || stream.status == StreamStatus::Completed {
            return 0;
        }

        let now = env.ledger().timestamp();
        if stream.cliff_time > 0 && now < stream.cliff_time {
            return 0;
        }

        let effective_end = core::cmp::min(now, stream.end_time);
        if effective_end <= stream.start_time {
            return 0;
        }

        let elapsed = effective_end - stream.start_time;

        let total_paused = if stream.status == StreamStatus::Paused && stream.pause_start > 0 {
            let current_pause = now.saturating_sub(stream.pause_start);
            stream.paused_duration.saturating_add(current_pause)
        } else {
            stream.paused_duration
        };

        let active_seconds = elapsed.saturating_sub(total_paused);
        let total_accrued = stream.rate_per_second * (active_seconds as i128);
        let unwithdrawn = total_accrued - stream.withdrawn;

        let remaining = stream.total_funded - stream.withdrawn;
        core::cmp::min(unwithdrawn, remaining).max(0)
    }

    fn push_stream_to_list(env: &Env, key: &DataKey, stream_id: u64) {
        let mut list: Vec<u64> = env.storage().persistent().get(key).unwrap_or(Vec::new(env));
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

        let employer = Address::generate(&env);
        let employee = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_contract.address();
        let token_admin_client = StellarAssetClient::new(&env, &token_addr);

        token_admin_client.mint(&employer, &1_000_000_000);

        let env = Box::leak(Box::new(env));
        let client = StreamContractClient::new(env, &contract_id);

        (env.clone(), employer, employee, token_addr, client)
    }

    #[test]
    fn test_create_and_accrue() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);
        assert_eq!(stream_id, 0);

        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });

        let accrued = client.get_accrued(&stream_id);
        assert_eq!(accrued, 50_000);
    }

    #[test]
    fn test_cliff_vesting() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream_with_cliff(
            &employer, &employee, &token, &100, &1000, &2000, &1300,
        );

        env.ledger().with_mut(|li| {
            li.timestamp = 1200;
        });
        assert_eq!(client.get_accrued(&stream_id), 0);

        env.ledger().with_mut(|li| {
            li.timestamp = 1350;
        });
        assert_eq!(client.get_accrued(&stream_id), 35_000);
    }

    #[test]
    fn test_batch_create_streams() {
        let (env, employer, employee1, token, client) = setup_test();
        let employee2 = Address::generate(&env);
        let employee3 = Address::generate(&env);

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let mut emps = Vec::new(&env);
        emps.push_back(employee1.clone());
        emps.push_back(employee2.clone());
        emps.push_back(employee3.clone());

        let mut rates = Vec::new(&env);
        rates.push_back(100);
        rates.push_back(200);
        rates.push_back(300);

        let mut starts = Vec::new(&env);
        starts.push_back(1000);
        starts.push_back(1000);
        starts.push_back(1000);

        let mut ends = Vec::new(&env);
        ends.push_back(2000);
        ends.push_back(2000);
        ends.push_back(2000);

        let mut cliffs = Vec::new(&env);
        cliffs.push_back(0);
        cliffs.push_back(1200);
        cliffs.push_back(0);

        let ids = client.batch_create_streams(
            &employer, &emps, &token, &rates, &starts, &ends, &cliffs,
        );
        assert_eq!(ids.len(), 3);

        assert_eq!(client.get_employer_stream_count(&employer), 3);
        let paginated = client.get_employer_streams_paginated(&employer, &0, &2);
        assert_eq!(paginated.len(), 2);
    }

    #[test]
    fn test_batch_withdraw() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let id1 = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);
        let id2 = client.create_stream(&employer, &employee, &token, &200, &1000, &2000);

        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });

        let mut ids = Vec::new(&env);
        ids.push_back(id1);
        ids.push_back(id2);

        let mut amounts = Vec::new(&env);
        amounts.push_back(20_000);
        amounts.push_back(40_000);

        let total = client.batch_withdraw(&employee, &ids, &amounts);
        assert_eq!(total, 60_000);

        let token_client = TokenClient::new(&env, &token);
        assert_eq!(token_client.balance(&employee), 60_000);
    }

    #[test]
    fn test_batch_pause_and_resume() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let id1 = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);
        let id2 = client.create_stream(&employer, &employee, &token, &200, &1000, &2000);

        let mut ids = Vec::new(&env);
        ids.push_back(id1);
        ids.push_back(id2);

        client.batch_pause_streams(&employer, &ids);

        let s1 = client.get_stream(&id1);
        assert_eq!(s1.status, StreamStatus::Paused);

        client.batch_resume_streams(&employer, &ids);
        let s1_resumed = client.get_stream(&id1);
        assert_eq!(s1_resumed.status, StreamStatus::Active);
    }

    #[test]
    fn test_transfer_recipient() {
        let (env, employer, employee1, token, client) = setup_test();
        let employee2 = Address::generate(&env);

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(&employer, &employee1, &token, &100, &1000, &2000);
        client.transfer_recipient(&employee1, &stream_id, &employee2);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.employee, employee2);

        assert_eq!(client.get_employee_stream_count(&employee2), 1);
    }

    #[test]
    fn test_withdraw() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);

        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });

        let withdrawn = client.withdraw(&employee, &stream_id, &30_000_i128);
        assert_eq!(withdrawn, 30_000);

        let token_client = TokenClient::new(&env, &token);
        assert_eq!(token_client.balance(&employee), 30_000);

        let accrued = client.get_accrued(&stream_id);
        assert_eq!(accrued, 20_000);
    }

    #[test]
    fn test_cancel_with_settlement() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);

        let token_client = TokenClient::new(&env, &token);
        let employer_before = token_client.balance(&employer);

        env.ledger().with_mut(|li| {
            li.timestamp = 1300;
        });

        let (emp_payout, empr_refund) = client.cancel_stream(&employer, &stream_id);
        assert_eq!(emp_payout, 30_000);
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

        let stream_id = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);

        env.ledger().with_mut(|li| {
            li.timestamp = 1200;
        });
        client.pause_stream(&employer, &stream_id);

        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });
        let accrued_while_paused = client.get_accrued(&stream_id);
        assert_eq!(accrued_while_paused, 20_000);

        client.resume_stream(&employer, &stream_id);

        env.ledger().with_mut(|li| {
            li.timestamp = 1600;
        });
        let accrued_after_resume = client.get_accrued(&stream_id);
        assert_eq!(accrued_after_resume, 30_000);
    }

    #[test]
    fn test_top_up() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);

        client.top_up(&employer, &stream_id, &50_000_i128);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.total_funded, 150_000);
        assert_eq!(stream.end_time, 2500);
    }

    #[test]
    fn test_employer_employee_stream_lists() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let id1 = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);
        let id2 = client.create_stream(&employer, &employee, &token, &50, &1000, &3000);

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

        let stream_id = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);

        env.ledger().with_mut(|li| {
            li.timestamp = 1100;
        });

        client.withdraw(&employee, &stream_id, &20_000_i128);
    }

    #[test]
    #[should_panic]
    fn test_unauthorized_withdraw() {
        let (env, employer, employee, token, client) = setup_test();

        env.ledger().with_mut(|li| {
            li.timestamp = 1000;
        });

        let stream_id = client.create_stream(&employer, &employee, &token, &100, &1000, &2000);

        env.ledger().with_mut(|li| {
            li.timestamp = 1500;
        });

        client.withdraw(&employer, &stream_id, &10_000_i128);
    }
}
