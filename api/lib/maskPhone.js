// A referrer sees a row per person they invited, and that row used to carry
// the invitee's whole phone number. Both clients already drew it masked, so
// nobody ever needed the digits on screen - they were only ever one devtools
// panel away from being copied. Masking here means the full number never
// leaves the server in the first place.
//
// Keeping the length and the last two digits is what the clients' own
// maskPhone() does, so a client that masks this string again gets the same
// string back and the UI is unchanged.
function maskPhone(phone) {
  if (!phone) return phone ?? null;
  const text = String(phone);
  if (text.length <= 2) return text;
  return '*'.repeat(text.length - 2) + text.slice(-2);
}

module.exports = { maskPhone };
