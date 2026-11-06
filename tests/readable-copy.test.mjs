import test from "node:test";
import assert from "node:assert/strict";
import { readableText, excerpt, pageDescription } from "../scripts/readable-copy.mjs";

test("inline scientific notation and punctuation survive teaser extraction", () => {
  assert.equal(readableText('<p><em>s</em>-wave scattering in <sup>162</sup>Dy. See “<a href="/">the paper</a>”.</p><p>Next paragraph.</p>'), 's-wave scattering in ¹⁶²Dy. See “the paper”. Next paragraph.');
  assert.equal(readableText('<p>10<sup>5</sup> atoms and 10<sup>−3</sup> seconds.</p>'), '10⁵ atoms and 10⁻³ seconds.');
  assert.equal(readableText('<p>First<br>second &amp; third</p>'), 'First second & third');
});

test("descriptions exclude navigation and duplicate headings, with whole-word excerpts", () => {
  assert.equal(pageDescription('A result', '<nav>Home / News</nav><h1>A result</h1><p>Here is the result.</p>'), 'A result: Here is the result.');
  assert.equal(pageDescription('162Dy gas', '<h1>162Dy gas</h1><p><sup>162</sup>Dy gas</p><p>A. Author</p>'), '162Dy gas: A. Author');
  assert.equal(excerpt('A complete phrase followed by more.', 20), 'A complete phrase…');
  assert.equal(excerpt('A short sentence.', 20), 'A short sentence.');
});
