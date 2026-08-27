#![no_main]

use base64::{
  alphabet,
  engine::{general_purpose::GeneralPurpose, DecodePaddingMode, GeneralPurposeConfig},
  Engine as _,
};
use libfuzzer_sys::fuzz_target;
use mreact_router_native::flight::decode_base64_bytes;

fuzz_target!(|data: &[u8]| {
  let input = String::from_utf8_lossy(data);
  let normalized = input.replace('-', "+").replace('_', "/");
  let reference = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
      .with_decode_padding_mode(DecodePaddingMode::Indifferent)
      .with_decode_allow_trailing_bits(true),
  )
  .decode(normalized.as_bytes());

  match (decode_base64_bytes(&input), reference) {
    (Ok(actual), Ok(expected)) => assert_eq!(actual, expected),
    (Err(_), Err(_)) => {}
    (actual, expected) => panic!("native/reference result mismatch: {actual:?} vs {expected:?}"),
  }
});
