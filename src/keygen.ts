import { execSync } from "child_process";
import { copyFileSync, readFileSync, writeFileSync } from "fs";
import * as readline from "readline";
import * as path from "path";
import { loadConfig } from "./config";
import { validateKey, readPool, writePool } from "./keystore";

const PROVIDERS: Record<string, { name: string; envKey: string; url: string; instructions: string }> = {
  nim: {
    name: "NVIDIA NIM",
    envKey: "NVIDIA_NIM_KEY",
    url: "https://build.nvidia.com",
    instructions: "Sign up free at build.nvidia.com (phone verification, no credit card). Your key starts with 'nvapi-'.",
  },
  gemini: {
    name: "Gemini",
    envKey: "M1_EMERGENCY_GEMINI_KEY",
    url: "https://aistudio.google.com/app/apikey",
    instructions: "Sign up free at aistudio.google.com. Your key is a long alphanumeric string.",
  },
  groq: {
    name: "Groq",
    envKey: "M1_EMERGENCY_GROQ_KEY",
    url: "https://console.groq.com/keys",
    instructions: "Sign up free at console.groq.com. Your key starts with 'gsk_'.",
  },
};

function openUrl(url: string): void {
  try {
    execSync(`termux-open-url "${url}"`, { timeout: 3000 });
  } catch {
    try {
      execSync(`xdg-open "${url}" 2>/dev/null || open "${url}"`, { timeout: 3000 });
    } catch {
      // fall through — just print URL
    }
  }
}

function promptKey(provider: string): Promise<string> {
  const info = PROVIDERS[provider];
  if (!info) {
    console.error(`Unknown provider: ${provider}. Valid: ${Object.keys(PROVIDERS).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n=== ${info.name} ===`);
  console.log(info.instructions);
  console.log(`Opening: ${info.url}\n`);
  openUrl(info.url);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Paste your ${info.name} API key and press Enter: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function updateEnvFile(envKey: string, value: string): void {
  const envPath = path.resolve(__dirname, "..", ".env");
  const bakPath = envPath + ".bak";

  // Backup existing .env — failure never blocks the write
  try {
    copyFileSync(envPath, bakPath);
  } catch {
    // backup is best-effort
  }

  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    console.error(`Cannot read .env at ${envPath}`);
    process.exit(1);
  }

  const regex = new RegExp(`^${envKey}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${envKey}=${value}`);
  } else {
    content += `\n${envKey}=${value}\n`;
  }

  writeFileSync(envPath, content, "utf-8");
  console.log(`✓ ${envKey} written to .env`);
}

async function validateAndAddToPool(provider: string, key: string): Promise<void> {
  try {
    const cfg = loadConfig();
    const valid = await validateKey(provider as "nim" | "gemini" | "groq", key, cfg);
    if (valid) {
      const pool = readPool();
      pool.keys.push({
        provider: provider as "nim" | "gemini" | "groq",
        key,
        status: "active",
        lastOk: new Date().toISOString(),
        failCount: 0,
        addedAt: new Date().toISOString(),
      });
      writePool(pool);
      console.log("✓ Key validated and added to pool");
    } else {
      console.log("⚠ Key saved to .env but failed live validation — not added to pool. Check the key and try again.");
    }
  } catch (err) {
    console.warn("[keygen] pool update skipped (non-fatal):", err);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("M1 Key Generator — Interactive CLI");
    console.log("\nUsage: npx tsx src/keygen.ts [provider]");
    console.log("Providers: " + Object.keys(PROVIDERS).join(", "));
    console.log("\nOmitting the provider opens an interactive menu.\n");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(`Which key do you want to set? (${Object.keys(PROVIDERS).join(" / ")}): `, (a) => {
        rl.close();
        resolve(a.trim().toLowerCase());
      });
    });
    if (!PROVIDERS[answer]) {
      console.error(`Invalid choice. Valid: ${Object.keys(PROVIDERS).join(", ")}`);
      process.exit(1);
    }
    const key = await promptKey(answer);
    if (key) {
      updateEnvFile(PROVIDERS[answer].envKey, key);
      await validateAndAddToPool(answer, key);
    }
    console.log("Done. Restart M1 for the new key to take effect.");
    return;
  }

  for (const arg of args) {
    const key = await promptKey(arg);
    if (key) {
      updateEnvFile(PROVIDERS[arg].envKey, key);
      await validateAndAddToPool(arg, key);
    }
  }
  console.log("Done. Restart M1 for the new key to take effect.");
}

main().catch((err) => {
  console.error("keygen failed:", err);
  process.exit(1);
});
