from pathlib import Path

fundamentals_path = Path("tests/data/global-fundamentals-provider.test.ts")
fundamentals = fundamentals_path.read_text()

old_yahoo_failure = '''    mocks.yahoo.mockResolvedValueOnce({
      ok: false,
      reason: "upstream_error",
      message: "Yahoo fundamentals unavailable.",
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error"),
    });'''
new_yahoo_failure = '''    mocks.yahoo.mockResolvedValue({
      ok: false,
      reason: "upstream_error",
      message: "Yahoo fundamentals unavailable.",
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error"),
    });'''
if old_yahoo_failure in fundamentals:
    fundamentals = fundamentals.replace(old_yahoo_failure, new_yahoo_failure, 1)
elif new_yahoo_failure not in fundamentals:
    raise SystemExit("Yahoo transient failure regression anchor not found")

old_stooq_expect = '''    expect(mocks.fetchStooqMarketData).toHaveBeenCalledOnce();
  });

  it("keeps SEC primary when a CIK-backed filing source succeeds"'''
new_stooq_expect = '''    expect(mocks.yahoo).toHaveBeenCalledTimes(2);
    expect(mocks.fetchStooqMarketData).toHaveBeenCalledOnce();
  });

  it("keeps SEC primary when a CIK-backed filing source succeeds"'''
if old_stooq_expect in fundamentals:
    fundamentals = fundamentals.replace(old_stooq_expect, new_stooq_expect, 1)
elif new_stooq_expect not in fundamentals:
    raise SystemExit("Yahoo retry count anchor not found")

old_sec_failure = '''    mocks.sec.mockResolvedValueOnce({
      ok: false, reason: "upstream_error", message: "SEC temporarily unavailable",
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error"),
    });'''
new_sec_failure = '''    mocks.sec.mockResolvedValue({
      ok: false, reason: "upstream_error", message: "SEC temporarily unavailable",
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error"),
    });'''
if old_sec_failure in fundamentals:
    fundamentals = fundamentals.replace(old_sec_failure, new_sec_failure, 1)
elif new_sec_failure not in fundamentals:
    raise SystemExit("SEC transient failure regression anchor not found")

old_sec_count = '''    expect(result.ok).toBe(true);
    expect(mocks.sec).toHaveBeenCalledTimes(1);
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
  });

  it("does not propagate stale Yahoo market cap or stale shares as current valuation inputs"'''
new_sec_count = '''    expect(result.ok).toBe(true);
    expect(mocks.sec).toHaveBeenCalledTimes(2);
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
  });

  it("does not propagate stale Yahoo market cap or stale shares as current valuation inputs"'''
if old_sec_count in fundamentals:
    fundamentals = fundamentals.replace(old_sec_count, new_sec_count, 1)
elif new_sec_count not in fundamentals:
    raise SystemExit("SEC retry count anchor not found")

fundamentals_path.write_text(fundamentals)

routing_path = Path("tests/env/market-provider-routing.test.ts")
routing = routing_path.read_text()
old_primary_count = '''    await expect(fetchMarketDataFromProviders(company, providers)).resolves.toEqual(fallbackResult);
    expect(primaryFetch).toHaveBeenCalledOnce();
    expect(fallbackFetch).toHaveBeenCalledOnce();'''
new_primary_count = '''    await expect(fetchMarketDataFromProviders(company, providers)).resolves.toEqual(fallbackResult);
    expect(primaryFetch).toHaveBeenCalledTimes(2);
    expect(fallbackFetch).toHaveBeenCalledOnce();'''
if old_primary_count in routing:
    routing = routing.replace(old_primary_count, new_primary_count, 1)
elif new_primary_count not in routing:
    raise SystemExit("Market provider retry count anchor not found")
routing_path.write_text(routing)
