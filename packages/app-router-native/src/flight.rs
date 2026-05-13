// React Flight protocol helpers (issue 081).
//
// All functions in this module are pure — no IO, no global state. They
// mirror the corresponding TypeScript helpers in
// `packages/server/src/flight.ts` exactly. Behavior parity is pinned by
// the conformance corpus at
// `packages/server/test/flight-roundtrip-corpus.test.ts`.

#[cfg(not(test))]
use napi::Error;
#[cfg(not(test))]
use napi_derive::napi;

/// Decode a (possibly URL-safe, possibly unpadded) base64 string into
/// its raw bytes. Mirrors `decodeBase64Bytes` at flight.ts:1129.
///
/// Tolerates the URL-safe alphabet (`-` and `_` map to `+` and `/`) and
/// pads the input with `=` to a multiple of 4 before decoding. Returns
/// an error string describing the bad character on malformed input —
/// this is converted to a `napi::Error` at the FFI boundary.
pub fn decode_base64_bytes(value: &str) -> Result<Vec<u8>, String> {
  let bytes = value.as_bytes();
  let groups = bytes.len().div_ceil(4);
  let mut output = Vec::with_capacity(groups * 3);
  let mut group = [0u8; 4];
  let mut group_len = 0usize;
  let mut padding = 0usize;

  for &byte in bytes {
    if padding > 0 {
      // After `=` we must only see more `=` (or whitespace, which we
      // do not accept in this strict decoder).
      if byte == b'=' {
        padding += 1;
        continue;
      }
      return Err(format!("Invalid base64 character after padding: {byte:#x}"));
    }
    if byte == b'=' {
      padding = 1;
      continue;
    }
    let decoded = decode_base64_char(byte)?;
    group[group_len] = decoded;
    group_len += 1;
    if group_len == 4 {
      output.push((group[0] << 2) | (group[1] >> 4));
      output.push((group[1] << 4) | (group[2] >> 2));
      output.push((group[2] << 6) | group[3]);
      group_len = 0;
    }
  }

  // Implicit padding: pad the trailing partial group with zero bits.
  if group_len == 2 {
    output.push((group[0] << 2) | (group[1] >> 4));
  } else if group_len == 3 {
    output.push((group[0] << 2) | (group[1] >> 4));
    output.push((group[1] << 4) | (group[2] >> 2));
  } else if group_len == 1 {
    return Err("Invalid base64 input: trailing single character".to_string());
  }

  Ok(output)
}

fn decode_base64_char(byte: u8) -> Result<u8, String> {
  match byte {
    b'A'..=b'Z' => Ok(byte - b'A'),
    b'a'..=b'z' => Ok(byte - b'a' + 26),
    b'0'..=b'9' => Ok(byte - b'0' + 52),
    // Standard + URL-safe alphabets fold together:
    b'+' | b'-' => Ok(62),
    b'/' | b'_' => Ok(63),
    other => Err(format!("Invalid base64 character: {other:#x}")),
  }
}

#[cfg(not(test))]
#[napi(js_name = "decodeFlightBase64")]
pub fn napi_decode_flight_base64(value: String) -> napi::Result<Vec<u8>> {
  decode_base64_bytes(&value).map_err(Error::from_reason)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn decodes_standard_alphabet() {
    // base64("hello") = "aGVsbG8="
    let result = decode_base64_bytes("aGVsbG8=").unwrap();
    assert_eq!(result, b"hello");
  }

  #[test]
  fn decodes_url_safe_alphabet() {
    // The bytes 0xFB, 0xFF, 0xBF encode to "+/+/" (standard) /
    // "-_-_" (url-safe); use a payload that exercises both `-` and `_`.
    let standard = decode_base64_bytes("+/+/").unwrap();
    let url_safe = decode_base64_bytes("-_-_").unwrap();
    assert_eq!(standard, url_safe);
  }

  #[test]
  fn tolerates_missing_padding() {
    // "aGVsbG8" with no `=` padding still decodes to "hello" because
    // the JS callsite pads to a multiple of 4 with `=` before decoding.
    let result = decode_base64_bytes("aGVsbG8").unwrap();
    assert_eq!(result, b"hello");
  }

  #[test]
  fn round_trips_arbitrary_byte_range() {
    // 0..255 base64-encodes to a 344-byte string in the standard
    // alphabet, including `+` / `/` characters. Verify we can decode
    // it back exactly. (Encoded via Node's `btoa` ahead of time.)
    let encoded = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==";
    let decoded = decode_base64_bytes(encoded).unwrap();
    assert_eq!(decoded.len(), 256);
    for (i, byte) in decoded.iter().enumerate() {
      assert_eq!(*byte as usize, i);
    }
  }

  #[test]
  fn rejects_invalid_character() {
    let err = decode_base64_bytes("!!!!").unwrap_err();
    assert!(err.contains("Invalid base64 character"), "{err}");
  }
}
