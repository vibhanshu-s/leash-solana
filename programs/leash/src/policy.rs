//! Pure spending rules. No Solana types beyond a 32-byte key, so every rule is
//! unit-tested natively, without a validator.

pub const WINDOW_SECONDS: i64 = 86_400;
pub const MAX_MERCHANTS: usize = 8;

/// Why a payment was refused. The order of checks in `check_payment` is the
/// order an operator sees them, from "agent switched off" to "budget used up".
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Refusal {
    Paused,
    Expired,
    ZeroAmount,
    MerchantNotAllowed,
    OverPaymentCap,
    OverDailyCap,
    Overflow,
}

/// Rules plus current spend for one owner + agent pair.
pub struct Rules<'a> {
    pub paused: bool,
    pub expires_at: i64,
    pub per_payment_cap: u64,
    pub daily_cap: u64,
    pub spent_in_window: u64,
    pub window_start: i64,
    pub merchants: &'a [[u8; 32]],
}

/// Spend state to store once the payment is allowed.
#[derive(Debug, PartialEq, Eq)]
pub struct Approved {
    pub spent_in_window: u64,
    pub window_start: i64,
}

pub fn check_payment(
    rules: &Rules,
    merchant: &[u8; 32],
    amount: u64,
    now: i64,
) -> Result<Approved, Refusal> {
    if rules.paused {
        return Err(Refusal::Paused);
    }
    if now >= rules.expires_at {
        return Err(Refusal::Expired);
    }
    if amount == 0 {
        return Err(Refusal::ZeroAmount);
    }
    if !rules.merchants.iter().any(|m| m == merchant) {
        return Err(Refusal::MerchantNotAllowed);
    }
    if amount > rules.per_payment_cap {
        return Err(Refusal::OverPaymentCap);
    }

    // A clock that moved backwards keeps the current window rather than resetting it.
    let elapsed = now.saturating_sub(rules.window_start);
    let (base, window_start) = if elapsed >= WINDOW_SECONDS {
        (0, now)
    } else {
        (rules.spent_in_window, rules.window_start)
    };

    let spent = base.checked_add(amount).ok_or(Refusal::Overflow)?;
    if spent > rules.daily_cap {
        return Err(Refusal::OverDailyCap);
    }

    Ok(Approved {
        spent_in_window: spent,
        window_start,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHOP: [u8; 32] = [1; 32];
    const THIEF: [u8; 32] = [9; 32];
    const START: i64 = 1_000_000;
    const ALLOWED: [[u8; 32]; 1] = [SHOP];

    fn rules() -> Rules<'static> {
        Rules {
            paused: false,
            expires_at: START + 7 * WINDOW_SECONDS,
            per_payment_cap: 100,
            daily_cap: 250,
            spent_in_window: 0,
            window_start: START,
            merchants: &ALLOWED,
        }
    }

    #[test]
    fn allows_a_payment_inside_every_limit() {
        let r = check_payment(&rules(), &SHOP, 100, START + 1).unwrap();
        assert_eq!(r.spent_in_window, 100);
        assert_eq!(r.window_start, START);
    }

    #[test]
    fn refuses_unknown_merchant() {
        assert_eq!(
            check_payment(&rules(), &THIEF, 1, START),
            Err(Refusal::MerchantNotAllowed)
        );
    }

    #[test]
    fn refuses_one_unit_over_the_payment_cap() {
        assert_eq!(
            check_payment(&rules(), &SHOP, 101, START),
            Err(Refusal::OverPaymentCap)
        );
    }

    #[test]
    fn refuses_when_daily_cap_would_be_passed() {
        let mut r = rules();
        r.spent_in_window = 200;
        assert_eq!(
            check_payment(&r, &SHOP, 51, START + 5),
            Err(Refusal::OverDailyCap)
        );
        assert_eq!(check_payment(&r, &SHOP, 50, START + 5).unwrap().spent_in_window, 250);
    }

    #[test]
    fn new_window_resets_spend_exactly_at_the_boundary() {
        let mut r = rules();
        r.spent_in_window = 250;
        assert_eq!(
            check_payment(&r, &SHOP, 1, START + WINDOW_SECONDS - 1),
            Err(Refusal::OverDailyCap)
        );
        let now = START + WINDOW_SECONDS;
        let ok = check_payment(&r, &SHOP, 1, now).unwrap();
        assert_eq!(ok.spent_in_window, 1);
        assert_eq!(ok.window_start, now);
    }

    #[test]
    fn backwards_clock_does_not_reset_the_window() {
        let mut r = rules();
        r.spent_in_window = 250;
        assert_eq!(
            check_payment(&r, &SHOP, 1, START - 500),
            Err(Refusal::OverDailyCap)
        );
    }

    #[test]
    fn paused_beats_every_other_rule() {
        let mut r = rules();
        r.paused = true;
        assert_eq!(check_payment(&r, &SHOP, 1, START), Err(Refusal::Paused));
    }

    #[test]
    fn expires_exactly_at_expiry() {
        let r = rules();
        assert_eq!(
            check_payment(&r, &SHOP, 1, r.expires_at),
            Err(Refusal::Expired)
        );
        assert!(check_payment(&r, &SHOP, 1, r.expires_at - 1).is_ok());
    }

    #[test]
    fn refuses_zero_amount() {
        assert_eq!(
            check_payment(&rules(), &SHOP, 0, START),
            Err(Refusal::ZeroAmount)
        );
    }

    #[test]
    fn spend_overflow_is_refused_not_wrapped() {
        let mut r = rules();
        r.per_payment_cap = u64::MAX;
        r.daily_cap = u64::MAX;
        r.spent_in_window = u64::MAX;
        assert_eq!(
            check_payment(&r, &SHOP, 1, START),
            Err(Refusal::Overflow)
        );
    }
}
