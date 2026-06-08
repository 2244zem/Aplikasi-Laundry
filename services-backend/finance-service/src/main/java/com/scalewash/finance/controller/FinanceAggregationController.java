package com.scalewash.finance.controller;

import com.scalewash.finance.service.FinanceAggregationResult;
import com.scalewash.finance.service.FinanceAggregationService;
import java.time.YearMonth;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/finance")
public class FinanceAggregationController {

    private final FinanceAggregationService financeAggregationService;

    public FinanceAggregationController(FinanceAggregationService financeAggregationService) {
        this.financeAggregationService = financeAggregationService;
    }

    @PostMapping("/aggregate")
    public FinanceAggregationResult aggregate(@RequestParam(required = false) String period) {
        YearMonth targetPeriod = period == null || period.isBlank()
            ? financeAggregationService.currentPeriod()
            : YearMonth.parse(period);

        return financeAggregationService.aggregateMonthlyFinance(targetPeriod);
    }
}
