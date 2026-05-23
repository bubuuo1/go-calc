const fs = require("fs");
const path = require("path");

const loadEnvFile = () => {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    process.env[key] ||= valueParts.join("=");
  }
};

const toRow = (transaction) => ({
  id: transaction.id,
  type: transaction.type,
  payment_method: transaction.paymentMethod,
  category: transaction.category,
  amount: Number(transaction.amount),
  memo: transaction.memo || "",
  date: transaction.date
});

const main = async () => {
  loadEnvFile();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const transactionsPath = path.join(__dirname, "..", "data", "transactions.json");
  const transactions = JSON.parse(
    fs.readFileSync(transactionsPath, "utf-8").replace(/^\uFEFF/, "")
  );

  const rows = transactions.map(toRow);
  const { error } = await supabase.from("transactions").upsert(rows, {
    onConflict: "id"
  });

  if (error) {
    throw error;
  }

  console.log(`Migrated ${rows.length} transactions to Supabase.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
