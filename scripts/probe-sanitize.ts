import { sanitizeFilename } from "../src/lib/sanitize";

const cases: Array<[string, string | RegExp]> = [
  ["../../etc/passwd", "passwd"],
  ["evil‮‭exe.pdf", "evilexe.pdf"],
  ["file\x00.pdf", "file.pdf"],
  ["....", /^file_\d+$/],
  ["good_file.pdf", "good_file.pdf"],
  ["C:\\Users\\thiru\\evil.pdf", "evil.pdf"],
  ["report.PDF", "report.pdf"],
  ["", /^file_\d+$/],
  ["  multiple   spaces.txt  ", "multiple spaces.txt"],
  ["semicolons;and$weird@chars#here.pdf", "semicolons_and_weird_chars_here.pdf"],
];

let pass = 0;
let fail = 0;
for (const [input, expected] of cases) {
  const got = sanitizeFilename(input);
  const ok = expected instanceof RegExp ? expected.test(got) : got === expected;
  if (ok) {
    pass += 1;
    console.log("  PASS:", JSON.stringify(input), "->", JSON.stringify(got));
  } else {
    fail += 1;
    console.log(
      "  FAIL:",
      JSON.stringify(input),
      "->",
      JSON.stringify(got),
      "(expected:",
      expected instanceof RegExp ? expected.toString() : JSON.stringify(expected),
      ")",
    );
  }
}
console.log("---", pass, "pass,", fail, "fail");
process.exit(fail > 0 ? 1 : 0);
