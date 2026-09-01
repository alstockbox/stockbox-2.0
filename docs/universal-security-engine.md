# Universal Security Analysis Engine

StockBox classifies the security before scoring it. Corporate metrics are only used when they are economically meaningful for the resolved security regime.

## Regimes

- Operating company
- Investment / holding company
- Bank
- Insurance company
- REIT / real-estate company
- Utility
- Commodity / mining company
- Pre-profit growth company
- Equity / index / sector / factor ETF
- Bond ETF
- Commodity ETF
- Leveraged / inverse ETF

## Investment companies

Investment-company analysis is NAV/SOTP-first. Consolidated book equity is never substituted for look-through NAV. The score uses NAV valuation, underlying holdings quality, NAV/share growth, capital allocation, shareholder returns, leverage, governance, diversification and dividend quality. Missing NAV inputs remain unavailable and prevent a fabricated rating.

## ETFs

ETF analysis is fund-specific and does not use corporate profitability or revenue-growth metrics. It evaluates underlying holdings quality, look-through valuation, cost, diversification, liquidity, tracking quality, risk-adjusted returns, concentration, fund stability and structure/tax efficiency. Bond, commodity and leveraged/inverse ETFs add regime-specific factors.

## Missing and unsuitable metrics

A missing factor is reported as missing. An economically unsuitable factor is reported as not applicable. Neither is converted into a zero score. Available weights are normalized over applicable factors and overall coverage limits the confidence and score.

## Data integrity

StockBox does not invent holdings, NAV, SOTP segment values, tracking statistics, credit quality or futures-curve inputs. If the configured providers do not expose a required fact, the report remains coverage-limited or unrated.
