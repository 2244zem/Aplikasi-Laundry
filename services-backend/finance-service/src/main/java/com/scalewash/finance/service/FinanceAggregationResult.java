package com.scalewash.finance.service;

import java.time.YearMonth;

public record FinanceAggregationResult(
    YearMonth period,
    int adminCount,
    int summaryRowsUpdated
) {
}
