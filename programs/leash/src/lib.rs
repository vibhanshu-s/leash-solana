//! Leash: spending limits for AI agents, enforced by the chain.
//!
//! An owner funds a vault and sets rules. The agent's key can only move money
//! through `pay`, so a hijacked model can ask for anything and still get nothing
//! the rules don't allow. Only the owner can change the rules.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

pub mod policy;

use policy::{check_payment, Refusal, Rules, MAX_MERCHANTS};

declare_id!("E5f5368y384TnC3XCFdTEhZnh1mCaHPKsy3zdZYchgtD");

#[program]
pub mod leash {
    use super::*;

    pub fn create_policy(ctx: Context<CreatePolicy>, args: PolicyArgs) -> Result<()> {
        args.validate()?;
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.policy;
        p.owner = ctx.accounts.owner.key();
        p.agent = ctx.accounts.agent.key();
        p.mint = ctx.accounts.mint.key();
        p.vault = ctx.accounts.vault.key();
        p.paused = false;
        p.spent_in_window = 0;
        p.window_start = now;
        p.total_spent = 0;
        p.payment_count = 0;
        p.bump = ctx.bumps.policy;
        args.apply(p);
        Ok(())
    }

    pub fn update_policy(ctx: Context<OwnerOnly>, args: PolicyArgs) -> Result<()> {
        args.validate()?;
        args.apply(&mut ctx.accounts.policy);
        Ok(())
    }

    /// The owner's kill switch. Takes effect from the next slot.
    pub fn set_paused(ctx: Context<OwnerOnly>, paused: bool) -> Result<()> {
        ctx.accounts.policy.paused = paused;
        emit!(PausedChanged {
            policy: ctx.accounts.policy.key(),
            paused
        });
        Ok(())
    }

    /// The only way an agent can move funds.
    pub fn pay(ctx: Context<Pay>, amount: u64, reason_hash: [u8; 32]) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let policy_key = ctx.accounts.policy.key();
        let p = &ctx.accounts.policy;
        let merchant = ctx.accounts.merchant_token.owner;

        let merchants: Vec<[u8; 32]> = p.merchants.iter().map(|m| m.to_bytes()).collect();
        let rules = Rules {
            paused: p.paused,
            expires_at: p.expires_at,
            per_payment_cap: p.per_payment_cap,
            daily_cap: p.daily_cap,
            spent_in_window: p.spent_in_window,
            window_start: p.window_start,
            merchants: &merchants,
        };
        let approved =
            check_payment(&rules, &merchant.to_bytes(), amount, now).map_err(LeashError::from)?;

        let (owner, agent, bump) = (p.owner, p.agent, p.bump);
        let seeds: &[&[u8]] = &[b"policy", owner.as_ref(), agent.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.merchant_token.to_account_info(),
                    authority: ctx.accounts.policy.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        let p = &mut ctx.accounts.policy;
        p.spent_in_window = approved.spent_in_window;
        p.window_start = approved.window_start;
        p.total_spent = p.total_spent.checked_add(amount).ok_or(LeashError::Overflow)?;
        p.payment_count = p.payment_count.checked_add(1).ok_or(LeashError::Overflow)?;

        emit!(PaymentMade {
            policy: policy_key,
            merchant,
            amount,
            reason_hash,
            spent_in_window: p.spent_in_window,
        });
        Ok(())
    }

    /// Owner takes funds back at any time. The agent has no equivalent.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let p = &ctx.accounts.policy;
        let (owner, agent, bump) = (p.owner, p.agent, p.bump);
        let seeds: &[&[u8]] = &[b"policy", owner.as_ref(), agent.as_ref(), &[bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.policy.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PolicyArgs {
    pub per_payment_cap: u64,
    pub daily_cap: u64,
    pub expires_at: i64,
    pub merchants: Vec<Pubkey>,
}

impl PolicyArgs {
    fn validate(&self) -> Result<()> {
        require!(self.merchants.len() <= MAX_MERCHANTS, LeashError::TooManyMerchants);
        require!(self.per_payment_cap <= self.daily_cap, LeashError::CapsOutOfOrder);
        Ok(())
    }

    fn apply(&self, p: &mut Policy) {
        p.per_payment_cap = self.per_payment_cap;
        p.daily_cap = self.daily_cap;
        p.expires_at = self.expires_at;
        p.merchants = self.merchants.clone();
    }
}

#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub owner: Pubkey,
    pub agent: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub per_payment_cap: u64,
    pub daily_cap: u64,
    pub spent_in_window: u64,
    pub window_start: i64,
    pub expires_at: i64,
    pub total_spent: u64,
    pub payment_count: u64,
    pub paused: bool,
    pub bump: u8,
    #[max_len(MAX_MERCHANTS)]
    pub merchants: Vec<Pubkey>,
}

#[derive(Accounts)]
pub struct CreatePolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: only stored as the key allowed to call `pay`.
    pub agent: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = owner,
        space = 8 + Policy::INIT_SPACE,
        seeds = [b"policy", owner.key().as_ref(), agent.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, Policy>,
    #[account(
        init,
        payer = owner,
        seeds = [b"vault", policy.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = policy
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub policy: Account<'info, Policy>,
}

#[derive(Accounts)]
pub struct Pay<'info> {
    pub agent: Signer<'info>,
    #[account(mut, has_one = agent, has_one = vault)]
    pub policy: Account<'info, Policy>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = merchant_token.mint == policy.mint @ LeashError::WrongMint)]
    pub merchant_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,
    #[account(has_one = owner, has_one = vault)]
    pub policy: Account<'info, Policy>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = destination.mint == policy.mint @ LeashError::WrongMint)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct PaymentMade {
    pub policy: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub reason_hash: [u8; 32],
    pub spent_in_window: u64,
}

#[event]
pub struct PausedChanged {
    pub policy: Pubkey,
    pub paused: bool,
}

#[error_code]
pub enum LeashError {
    #[msg("The owner has paused this agent")]
    PolicyPaused,
    #[msg("This policy has expired")]
    PolicyExpired,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Merchant is not on the allowlist")]
    MerchantNotAllowed,
    #[msg("Amount is over the per-payment cap")]
    OverPaymentCap,
    #[msg("Amount would pass the daily cap")]
    OverDailyCap,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Too many merchants")]
    TooManyMerchants,
    #[msg("Per-payment cap cannot exceed the daily cap")]
    CapsOutOfOrder,
    #[msg("Token account uses the wrong mint")]
    WrongMint,
}

impl From<Refusal> for LeashError {
    fn from(r: Refusal) -> Self {
        match r {
            Refusal::Paused => LeashError::PolicyPaused,
            Refusal::Expired => LeashError::PolicyExpired,
            Refusal::ZeroAmount => LeashError::ZeroAmount,
            Refusal::MerchantNotAllowed => LeashError::MerchantNotAllowed,
            Refusal::OverPaymentCap => LeashError::OverPaymentCap,
            Refusal::OverDailyCap => LeashError::OverDailyCap,
            Refusal::Overflow => LeashError::Overflow,
        }
    }
}
