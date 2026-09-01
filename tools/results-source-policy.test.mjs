import assert from "node:assert/strict";
import test from "node:test";
import { assertNoSpecialGitEntries } from "./results-source-policy.mjs";

test("accepts regular and executable tracked files", () => {
  assert.doesNotThrow(() =>
    assertNoSpecialGitEntries(
      "100644 1111111111111111111111111111111111111111 0\tcatalog.json\0" +
        "100755 2222222222222222222222222222222222222222 0\tverify.sh\0",
    ),
  );
});

test("rejects tracked symlinks and gitlinks without exposing their names", () => {
  const index =
    "120000 1111111111111111111111111111111111111111 0\tprivate-link\0" +
    "160000 2222222222222222222222222222222222222222 0\tnested-repository\0";
  assert.throws(
    () => assertNoSpecialGitEntries(index),
    (error) => {
      assert.match(error.message, /gitlink, symbolic-link/);
      assert.doesNotMatch(error.message, /private-link|nested-repository/);
      return true;
    },
  );
});
