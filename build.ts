// Production build: bundles index.html with Tailwind, code-splits lazy apps into dist/.
// SITE_URL (e.g. https://ubuntu.example.com) makes the Open Graph/Twitter image and canonical URLs absolute.
import tailwind from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";

const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/$/, "");

await rm("./dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  plugins: [tailwind],
  splitting: true,
  minify: true,
  sourcemap: "linked",
});
for (const log of result.logs) console.error(log);
if (!result.success) process.exit(1);

// Bun inlines every CSS url() as base64: all @fontsource subsets × weights × (woff2 + woff) became 1.7 MB of
// render-blocking CSS. Move the woff2 fonts out to files, so the browser fetches only the unicode-range
// subsets a page uses, and drop the woff fallbacks (every supported browser takes woff2).
const writes: Promise<number>[] = [];
for (const output of result.outputs.filter((file) => file.path.endsWith(".css"))) {
  const css = (await Bun.file(output.path).text())
    .replace(/,\s*url\(data:font\/woff;base64,[^)]*\)\s*format\(["']?woff["']?\)/g, "")
    .replace(/url\(data:font\/woff2;base64,([^)]*)\)/g, (_, data: string) => {
      const bytes = Buffer.from(data, "base64");
      const name = `font-${Bun.hash(bytes).toString(36)}.woff2`;
      writes.push(Bun.write(`./dist/${name}`, bytes));
      return `url(./${name})`;
    });
  writes.push(Bun.write(output.path, css));
}
const html = await Bun.file("./dist/index.html").text();
writes.push(Bun.write("./dist/index.html", html.replaceAll("%SITE_URL%", SITE_URL)));
writes.push(Bun.write("./dist/og.png", Bun.file("./public/og.png")));
await Promise.all(writes);
console.log(
  `built ${result.outputs.length} files${SITE_URL ? ` for ${SITE_URL}` : " (set SITE_URL for absolute social preview URLs)"}`,
);
