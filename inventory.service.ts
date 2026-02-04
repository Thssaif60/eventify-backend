import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../utils/httpError.js";
import { ensureSystemAccounts } from "../accounting/systemAccounts.js";
import { postJournal } from "../accounting/posting.js";

function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

const LineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().default(0)
});

const CreateSchema = z.object({
  type: z.enum(["OPENING","PURCHASE","SALE","CONSUMPTION","PRODUCTION","TRANSFER","WASTAGE"]),
  movedOn: z.string().datetime().optional().nullable(),
  memo: z.string().optional().nullable(),
  lines: z.array(LineSchema).min(1)
});

export async function list(businessId: string, q: any) {
  const items = await prisma.inventoryMove.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { lines: { include: { item: true } } }
  });
  return { items };
}

export async function get(businessId: string, id: string) {
  const move = await prisma.inventoryMove.findFirst({
    where: { businessId, id },
    include: { lines: { include: { item: true } }, postedJournal: true }
  });
  if (!move) throw new HttpError(404, "Inventory move not found");
  return move;
}


export async function create(businessId: string, userId: string, input: unknown) {
  const data = CreateSchema.parse(input);
  const movedOn = data.movedOn ? new Date(data.movedOn) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const accts = await ensureSystemAccounts(businessId, tx);
    const settings = await tx.businessSettings.upsert({ where: { businessId }, update: {}, create: { businessId } });
    const costing = (settings.inventoryCosting || "FIFO") as "FIFO" | "AVG";

    // validate items exist
    const itemIds = [...new Set(data.lines.map(l => l.itemId))];
    const items = await tx.item.findMany({ where: { businessId, id: { in: itemIds } } });
    if (items.length !== itemIds.length) throw new HttpError(400, "One or more items not found");
    const itemMap = new Map(items.map(i => [i.id, i]));

    // Create move + lines (cost for issues will be computed server-side)
    const move = await tx.inventoryMove.create({
      data: {
        businessId,
        type: data.type as any,
        movedOn,
        memo: data.memo ?? undefined,
        lines: {
          create: data.lines.map(l => ({
            itemId: l.itemId,
            qty: l.qty as any,
            unitCost: ((data.type === "PRODUCTION" || data.type === "PURCHASE" || data.type === "OPENING") ? l.unitCost : 0) as any,
            totalCost: ((data.type === "PRODUCTION" || data.type === "PURCHASE" || data.type === "OPENING") ? round(l.qty * l.unitCost) : 0) as any
          }))
        }
      },
      include: { lines: true }
    });

    // Helper to round qty and costs
    const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;

    // Costing + onHand updates
    let totalCost = 0;

    for (const line of move.lines) {
      const qty = Number(line.qty || 0);
      const item = itemMap.get(line.itemId);
      if (!item) throw new HttpError(400, "Item not found");

      if (data.type === "TRANSFER") {
        // No quantity or accounting impact in this simplified model.
        continue;
      }

      if (data.type === "PRODUCTION" || data.type === "PURCHASE" || data.type === "OPENING") {
        const unitCost = Number(line.unitCost || 0);
        const lineCost = round(qty * unitCost);

        // Update item onHand and avgCost (AVG method)
        if (costing === "AVG") {
          const onHand = Number(item.onHand || 0);
          const avgCost = Number(item.avgCost || 0);
          const newOnHand = onHand + qty;
          const newAvg = newOnHand > 0 ? ((onHand * avgCost) + (qty * unitCost)) / newOnHand : unitCost;
          const newAvgRounded = round6(newAvg);
          await tx.item.update({
            where: { id: item.id },
            data: { onHand: { increment: qty as any }, avgCost: newAvgRounded as any }
          });
          // keep itemMap roughly accurate for subsequent lines
          itemMap.set(item.id, { ...(item as any), onHand: newOnHand as any, avgCost: newAvgRounded as any });
        } else {
          await tx.item.update({ where: { id: item.id }, data: { onHand: { increment: qty as any } } });
          itemMap.set(item.id, { ...(item as any), onHand: (Number(item.onHand || 0) + qty) as any });
        }

        // Create FIFO lot (also useful for audit even if AVG)
        await tx.inventoryLot.create({
          data: {
            businessId,
            itemId: item.id,
            receivedOn: movedOn,
            sourceType: "INVENTORY_MOVE",
            sourceId: move.id,
            qtyIn: qty as any,
            qtyRemaining: qty as any,
            unitCost: unitCost as any
          }
        });

        // Update move line costs
        await tx.inventoryMoveLine.update({
          where: { id: line.id },
          data: { unitCost: unitCost as any, totalCost: lineCost as any }
        });

        totalCost += lineCost;
        continue;
      }

      // SALE / CONSUMPTION / WASTAGE (inventory OUT)
      const currentOnHand = Number(item.onHand || 0);
      if (currentOnHand < qty - 1e-9) throw new HttpError(409, `Insufficient stock for item ${item.name}`);

      if (costing === "AVG") {
        const unitCost = Number(item.avgCost || 0);
        if (unitCost <= 0) throw new HttpError(409, `Average cost not set for item ${item.name}. Produce/receive stock first.`);
        const lineCost = round(qty * unitCost);

        await tx.item.update({ where: { id: item.id }, data: { onHand: { decrement: qty as any } } });
        itemMap.set(item.id, { ...(item as any), onHand: (currentOnHand - qty) as any });

        await tx.inventoryMoveLine.update({
          where: { id: line.id },
          data: { unitCost: unitCost as any, totalCost: lineCost as any }
        });

        totalCost += lineCost;
      } else {
        // FIFO allocation from lots
        let remaining = qty;
        let lineCost = 0;

        const lots = await tx.inventoryLot.findMany({
          where: { businessId, itemId: item.id, qtyRemaining: { gt: 0 } },
          orderBy: [{ receivedOn: "asc" }, { createdAt: "asc" }]
        });

        for (const lot of lots) {
          if (remaining <= 0) break;
          const avail = Number(lot.qtyRemaining || 0);
          if (avail <= 0) continue;

          const take = Math.min(remaining, avail);
          const unitCost = Number(lot.unitCost || 0);
          const cost = round(take * unitCost);

          // decrement lot remaining
          await tx.inventoryLot.update({ where: { id: lot.id }, data: { qtyRemaining: { decrement: take as any } } });

          // record allocation
          await tx.inventoryLotAllocation.create({
            data: {
              businessId,
              lotId: lot.id,
              moveLineId: line.id,
              qty: take as any,
              unitCost: unitCost as any,
              cost: cost as any
            }
          });

          lineCost += cost;
          remaining -= take;
        }

        if (remaining > 1e-9) throw new HttpError(409, `Insufficient FIFO lots for item ${item.name}`);

        const effUnit = qty > 0 ? round6(lineCost / qty) : 0;

        await tx.item.update({ where: { id: item.id }, data: { onHand: { decrement: qty as any } } });
        itemMap.set(item.id, { ...(item as any), onHand: (currentOnHand - qty) as any });

        await tx.inventoryMoveLine.update({
          where: { id: line.id },
          data: { unitCost: effUnit as any, totalCost: round(lineCost) as any }
        });

        totalCost += round(lineCost);
      }
    }

    // Accounting impact
    let journalId: string | undefined;
    if (totalCost > 0 && data.type !== "TRANSFER") {
      const lines = (() => {
        switch (data.type) {
          case "SALE":
            return [
              { accountId: accts.COGS.id, debit: totalCost, memo: "COGS" },
              { accountId: accts.INVENTORY.id, credit: totalCost, memo: "Inventory out" }
            ];
          case "CONSUMPTION":
            return [
              { accountId: accts.COGS.id, debit: totalCost, memo: "Consumption" },
              { accountId: accts.INVENTORY.id, credit: totalCost, memo: "Inventory out" }
            ];
          case "PRODUCTION":
            return [
              { accountId: accts.INVENTORY.id, debit: totalCost, memo: "Inventory in" },
              { accountId: accts.INVENTORY_ADJ.id, credit: totalCost, memo: "Production offset" }
            ];
          case "WASTAGE":
            return [
              { accountId: accts.WASTAGE.id, debit: totalCost, memo: "Wastage" },
              { accountId: accts.INVENTORY.id, credit: totalCost, memo: "Inventory out" }
            ];
          default:
            return [];
        }
      })();

      const j = await postJournal({
        businessId,
        refType: "INVENTORY_MOVE",
        refId: move.id,
        postedOn: movedOn,
        memo: `Inventory ${data.type}`,
        lines
      });

      journalId = j.id;
      await tx.inventoryMove.update({ where: { id: move.id }, data: { postedJournalId: journalId } });
    }

    await tx.auditLog.create({
      data: { businessId, userId, action: "CREATE", entity: "InventoryMove", entityId: move.id, meta: { ...move, costing, totalCost } as any }
    });

    return { ...move, postedJournalId: journalId };
  });

  return result;
}

