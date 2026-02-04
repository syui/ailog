use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Base32-sort character set used by ATProto TIDs
const BASE32_SORT: &[u8; 32] = b"234567abcdefghijklmnopqrstuvwxyz";

/// Atomic counter for clock ID to avoid collisions within the same microsecond
static CLOCK_ID: AtomicU32 = AtomicU32::new(0);

/// Generate a TID (Timestamp Identifier) per the ATProto specification.
///
/// Format: 13 characters of base32-sort encoding
/// - Bits 63..10: microsecond timestamp (54 bits)
/// - Bits 9..0: clock ID (10 bits, wrapping counter)
///
/// The high bit (bit 63) is always 0 to keep the value positive.
pub fn generate_tid() -> String {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before UNIX epoch")
        .as_micros() as u64;

    let clk = CLOCK_ID.fetch_add(1, Ordering::Relaxed) & 0x3FF; // 10-bit wrap

    // Combine: timestamp in upper 54 bits, clock ID in lower 10 bits
    let tid_value: u64 = (micros << 10) | (clk as u64);

    encode_base32_sort(tid_value)
}

/// Encode a u64 into a 13-character base32-sort string (big-endian, zero-padded).
fn encode_base32_sort(mut value: u64) -> String {
    let mut buf = [b'2'; 13]; // '2' is 0 in base32-sort

    for i in (0..13).rev() {
        buf[i] = BASE32_SORT[(value & 0x1F) as usize];
        value >>= 5;
    }

    // Safety: all chars are ASCII
    String::from_utf8(buf.to_vec()).expect("base32-sort is always valid UTF-8")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tid_length() {
        let tid = generate_tid();
        assert_eq!(tid.len(), 13);
    }

    #[test]
    fn tid_charset() {
        let tid = generate_tid();
        let valid: &str = "234567abcdefghijklmnopqrstuvwxyz";
        for c in tid.chars() {
            assert!(valid.contains(c), "invalid char in TID: {}", c);
        }
    }

    #[test]
    fn tid_monotonic() {
        let a = generate_tid();
        let b = generate_tid();
        // TIDs generated in sequence should sort correctly
        assert!(a < b || a == b, "TIDs should be monotonically increasing: {} >= {}", a, b);
    }

    #[test]
    fn encode_zero() {
        let encoded = encode_base32_sort(0);
        assert_eq!(encoded, "2222222222222");
    }

    #[test]
    fn encode_known_value() {
        // Verify encoding produces consistent results
        let encoded = encode_base32_sort(1);
        assert_eq!(encoded, "2222222222223");
    }
}
