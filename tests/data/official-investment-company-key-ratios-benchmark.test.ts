import { describe, expect, it } from "vitest";

import { parseIndustrivardenOfficialKeyRatios } from "../../src/lib/data/official-investment-company-key-ratios";

const html = `
<table>
  <thead><tr><th></th><th>2025</th><th>2024</th><th>2023</th><th>2022</th><th>2021</th><th>2020</th></tr></thead>
  <tbody>
    <tr><td>Equities portfolio</td></tr>
    <tr><td>total return, %</td><td>22</td><td>8</td><td>33</td><td>-9</td><td>21</td><td>7</td></tr>
    <tr><td>net purchases/sales, SEK mn</td><td>4,650</td><td>4,566</td><td>2,854</td><td>3,184</td><td>2,258</td><td>4,106</td></tr>
    <tr><td>Net debt</td></tr>
    <tr><td>value, SEK mn</td><td>-5,920</td><td>-6,914</td><td>-7,295</td><td>-7,355</td><td>-6,500</td><td>-7,654</td></tr>
    <tr><td>debt-equities ratio, %</td><td>3</td><td>4</td><td>5</td><td>5</td><td>4</td><td>6</td></tr>
    <tr><td>Net asset value</td></tr>
    <tr><td>value per share, SEK</td><td>444</td><td>370</td><td>329</td><td>293</td><td>332</td><td>279</td></tr>
    <tr><td>Number of shares outstanding</td></tr>
    <tr><td>total, thousands</td><td>431,899</td><td>431,899</td><td>431,899</td><td>431,899</td><td>431,899</td><td>435,210</td></tr>
    <tr><td>Dividends paid</td></tr>
    <tr><td>value, SEK mn</td><td>3,779</td><td>3,563</td><td>3,347</td><td>3,131</td><td>2,915</td><td>3,590</td></tr>
    <tr><td>value per share, SEK</td><td>8.75</td><td>8.25</td><td>7.75</td><td>7.25</td><td>6.75</td><td>8.25</td></tr>
    <tr><td>Total return, Industrivärden shares</td></tr>
    <tr><td>Total return index (SIXRX), %</td><td>13</td><td>9</td><td>19</td><td>-23</td><td>39</td><td>15</td></tr>
    <tr><td>Other key ratios</td></tr>
    <tr><td>Dividends received, SEK mn</td><td>9,532</td><td>8,585</td><td>6,418</td><td>5,479</td><td>8,081</td><td>657</td></tr>
  </tbody>
</table>`;

describe("official investment-company benchmark history", () => {
  it("keeps SIXRX annual total returns aligned with the same official year columns", () => {
    const parsed = parseIndustrivardenOfficialKeyRatios(html);

    expect(parsed).not.toBeNull();
    expect(parsed?.years[0]).toEqual(expect.objectContaining({
      year: 2025,
      benchmarkReturnSixrx: 0.13,
    }));
    expect(parsed?.years[5]).toEqual(expect.objectContaining({
      year: 2020,
      benchmarkReturnSixrx: 0.15,
    }));
  });

  it("fails closed when the official benchmark row is absent instead of treating portfolio return as benchmark return", () => {
    const withoutBenchmark = html.replace(
      /<tr><td>Total return index \(SIXRX\), %<\/td>[\s\S]*?<\/tr>/,
      "",
    );

    expect(parseIndustrivardenOfficialKeyRatios(withoutBenchmark)).toBeNull();
  });
});
