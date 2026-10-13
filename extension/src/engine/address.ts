import { ADDRESS_FIELDS, type AddressUse } from "../../../shared/profileSchema";
import type { LabelInfo } from "./label";
import { normalizeLabel } from "./text";

const EXCLUDED = /邮箱|电子|户籍|户口|籍贯|生源|公司|单位|工作|学校|院校|网址|档案|紧急|亲属|父亲|母亲|email|e-mail|employer|office|work|school|university|website|url|emergency|referee|parent|line\s*2|address\s*2|地址[2二]|第二行/i;
const POSTCODE = /邮编|邮政编码|post\s*code|postal\s*code|postcode|\bzip(?:\s*code)?\b/i;
const REGION = /所在地区|所在地|省.*市|省份|地区|address region/i;

/** null means two different address purposes appear together and need human interpretation. */
function purpose(text: string): AddressUse | null | undefined {
  const found: AddressUse[] = [];
  if (/通讯|通信|联系地址|邮寄|收件|mailing|correspondence|postal address|shipping/i.test(text)) found.push("mailing");
  if (/现居|现住|居住地址|居住地|居住邮|居住地区|current\s+(?:residen|address|postal|post\s*code|zip)|residential|residence/i.test(text)) found.push("current");
  if (/家庭.*(?:地址|住址|邮编|邮政|地区|所在地)|家[庭乡]地址|永久.*(?:地址|住址)|home\s+(?:address|postal|post\s*code|zip)|permanent\s+address/i.test(text)) found.push("home");
  return found.length > 1 ? null : found[0];
}

/** Only read captions around the field, not the values typed into neighbouring controls. */
function surroundingPurpose(info: LabelInfo, heading: Element | null): AddressUse | null | undefined {
  let node: Element | null = info.container;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const legend = node.matches("fieldset") ? node.querySelector(":scope > legend")?.textContent : node.getAttribute("aria-label");
    const grouped = legend ? purpose(legend) : undefined;
    if (grouped !== undefined) return grouped;
    let previous = node.previousElementSibling;
    for (let count = 0; previous && count < 6; count++, previous = previous.previousElementSibling) {
      const caption = previous.matches("h1,h2,h3,h4,h5,h6,legend")
        ? previous.textContent
        : previous.querySelector("label,.el-form-item__label,.ant-form-item-label,legend,h1,h2,h3,h4")?.textContent;
      const text = caption ?? "";
      // A current-city field is a separate fact, not a heading for a postal address block.
      const hint = !EXCLUDED.test(text) && /地址|住址|邮编|address|postcode|postal|zip/i.test(text) ? purpose(text) : undefined;
      if (hint !== undefined) return hint;
      // A new section heading ends the address block.
      if (previous.matches("h1,h2,h3,h4,h5,h6")) break;
    }
  }
  return heading ? purpose(heading.textContent ?? "") : undefined;
}

/** undefined: unrelated field; null: ambiguous address; string: purpose-specific profile key. */
export function addressFieldKey(info: LabelInfo, heading: Element | null, defaultUse: AddressUse): string | null | undefined {
  const text = normalizeLabel(info.label || info.placeholder);
  if (EXCLUDED.test(text) || /是否|有无|same as|same address/i.test(text)) return undefined;
  const tokens = info.autocomplete.split(/\s+/);
  const postal = POSTCODE.test(text) || tokens.includes("postal-code");
  const address = /地址|住址|\baddress\b/i.test(text) || tokens.some((token) => ["street-address", "address-line1"].includes(token));
  const region = REGION.test(text) && Boolean(purpose(text));
  if (!postal && !address && !region) return undefined;
  const explicit = purpose(text);
  if (explicit === null) return null;
  const nearby = explicit === undefined ? surroundingPurpose(info, heading) : undefined;
  if (nearby === null) return null;
  const use = explicit ?? nearby ?? (tokens.includes("shipping") ? "mailing" : defaultUse);
  return ADDRESS_FIELDS[use][postal ? "postcode" : REGION.test(text) ? "region" : "address"];
}
