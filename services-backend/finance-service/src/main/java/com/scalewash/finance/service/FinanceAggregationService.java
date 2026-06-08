package com.scalewash.finance.service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class FinanceAggregationService {

    private final JdbcTemplate jdbcTemplate;
    private final ZoneId financeZone;

    public FinanceAggregationService(
        JdbcTemplate jdbcTemplate,
        @Value("${scalewash.finance.zone:Asia/Jakarta}") String financeZone
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.financeZone = ZoneId.of(financeZone);
    }

    @Scheduled(cron = "0 0 23 * * *", zone = "${scalewash.finance.zone:Asia/Jakarta}")
    public void scheduledAggregateMonthlyFinance() {
        FinanceAggregationResult result = aggregateMonthlyFinance(currentPeriod());
        System.out.printf(
            "Finance aggregation completed for %s: %d admins, %d rows updated.%n",
            result.period(),
            result.adminCount(),
            result.summaryRowsUpdated()
        );
    }

    public YearMonth currentPeriod() {
        return YearMonth.now(financeZone);
    }

    public FinanceAggregationResult aggregateMonthlyFinance(YearMonth period) {
        LocalDate periodStart = period.atDay(1);
        LocalDate nextPeriodStart = period.plusMonths(1).atDay(1);
        Timestamp startTimestamp = Timestamp.valueOf(periodStart.atStartOfDay());
        Timestamp endTimestamp = Timestamp.valueOf(nextPeriodStart.atStartOfDay());
        String bulanTahun = period.toString();

        List<UUID> adminIds = findActiveAdminIds(startTimestamp, endTimestamp);
        int updatedRows = 0;

        for (UUID adminId : adminIds) {
            BigDecimal totalIncome = sumIncome(adminId, startTimestamp, endTimestamp);
            BigDecimal totalExpense = sumExpense(adminId, startTimestamp, endTimestamp);
            BigDecimal netProfit = totalIncome.subtract(totalExpense);

            updatedRows += upsertMonthlyBalance(adminId, bulanTahun, totalIncome, totalExpense, netProfit);
        }

        return new FinanceAggregationResult(period, adminIds.size(), updatedRows);
    }

    private List<UUID> findActiveAdminIds(Timestamp startTimestamp, Timestamp endTimestamp) {
        String query = """
            select distinct admin_id
            from (
                select admin_outlet_id as admin_id
                from public.tabel_order
                where admin_outlet_id is not null
                  and created_at >= ?
                  and created_at < ?

                union

                select admin_id
                from public.tabel_pengeluaran
                where created_at >= ?
                  and created_at < ?
            ) active_admins
            where admin_id is not null
            """;

        return jdbcTemplate.query(
            query,
            (rs, rowNum) -> rs.getObject("admin_id", UUID.class),
            startTimestamp,
            endTimestamp,
            startTimestamp,
            endTimestamp
        );
    }

    private BigDecimal sumIncome(UUID adminId, Timestamp startTimestamp, Timestamp endTimestamp) {
        String query = """
            select coalesce(sum(total_harga), 0)
            from public.tabel_order
            where admin_outlet_id = ?
              and status_pembayaran = 'PAID'
              and created_at >= ?
              and created_at < ?
            """;

        return jdbcTemplate.queryForObject(
            query,
            BigDecimal.class,
            adminId,
            startTimestamp,
            endTimestamp
        );
    }

    private BigDecimal sumExpense(UUID adminId, Timestamp startTimestamp, Timestamp endTimestamp) {
        String query = """
            select coalesce(sum(nominal), 0)
            from public.tabel_pengeluaran
            where admin_id = ?
              and created_at >= ?
              and created_at < ?
            """;

        return jdbcTemplate.queryForObject(
            query,
            BigDecimal.class,
            adminId,
            startTimestamp,
            endTimestamp
        );
    }

    private int upsertMonthlyBalance(
        UUID adminId,
        String bulanTahun,
        BigDecimal totalIncome,
        BigDecimal totalExpense,
        BigDecimal netProfit
    ) {
        String query = """
            insert into public.tabel_neraca_bulanan (
                admin_id,
                bulan_tahun,
                total_pendapatan_kotor,
                total_pengeluaran,
                pendapatan_bersih,
                updated_at
            )
            values (?, ?, ?, ?, ?, now())
            on conflict (admin_id, bulan_tahun) do update set
                total_pendapatan_kotor = excluded.total_pendapatan_kotor,
                total_pengeluaran = excluded.total_pengeluaran,
                pendapatan_bersih = excluded.pendapatan_bersih,
                updated_at = now()
            """;

        return jdbcTemplate.update(query, adminId, bulanTahun, totalIncome, totalExpense, netProfit);
    }
}
