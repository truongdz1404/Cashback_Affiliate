// Shopee's affiliate report does not hand back the five sub ids separately -
// it returns them joined with '-' in `utm_content`:
//
//   sub_id1-sub_id2-sub_id3-sub_id4-sub_id5
//
// A link tracked with only sub_id1 (what lib/linkTracking.js mints) therefore
// comes back as `e77053aa49----`, and an order with no tracking at all as the
// bare separators `----`. links.sub_id stores the value on its own, so the
// joined string has to be split apart again before anything can be matched
// back to the user who owns the link.
//
// Sub ids we mint are hex (see linksRepo.generateSubId), so they never contain
// a '-' of their own and the first segment is always the whole sub_id1.
function parseSubId(value) {
  if (value === null || value === undefined) return null;
  const first = String(value).split('-')[0].trim();
  return first || null;
}

module.exports = { parseSubId };
