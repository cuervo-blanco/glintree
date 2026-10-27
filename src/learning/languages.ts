import { languageCode } from "./model";

const names = new Intl.DisplayNames(["en"], { type: "language" });
const languages =
  "ar bg bn ca cs da de el en es et fa fi fr gu he hi hr hu id it ja kn ko lt lv ml mr ms nl no pa pl pt ro ru sk sl sr sv sw ta te th tr uk ur vi zh".split(
    " ",
  );
export function languageOptions(
  select: HTMLSelectElement,
  value: string,
): void {
  const base = languageCode(value);
  const code = /^[a-z]{2,3}$/.test(base) ? base : "und";
  const codes = [...new Set([...languages, code])].filter(
    (entry) => entry !== "und",
  );
  const options = codes
    .map((entry) => ({ code: entry, name: names.of(entry) ?? entry }))
    .sort((a, b) => a.name.localeCompare(b.name));
  select.replaceChildren(
    new Option("Not specified", "und"),
    ...options.map((entry) => new Option(entry.name, entry.code)),
  );
  select.value = code;
}
