import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import process from "node:process";
import { readEnvironment } from "../src/config/env.js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error("Password prompt requires an interactive terminal. Run this command directly in CMD or PowerShell.");
  }
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    }

    function onData(char) {
      if (char === "\u0003") {
        cleanup();
        reject(new Error("Cancelled"));
        return;
      }
      if (char === "\r" || char === "\n") {
        cleanup();
        resolve(value);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        if (value.length) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      value += char;
      stdout.write("*");
    }
    stdin.on("data", onData);
  });
}

async function findUserByEmail(admin, email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 100) return null;
    page += 1;
  }
}

let rl = createInterface({ input: process.stdin, output: process.stdout });

try {
  const config = readEnvironment();
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const email = (argument("email") || await rl.question("Admin email: ")).trim().toLowerCase();
  const fullName = (argument("name") || await rl.question("Display name: ")).trim();
  rl.close();
  rl = null;
  const password = await hiddenQuestion("Password (minimum 12 characters): ");

  if (!/^\S+@\S+\.\S+$/u.test(email)) throw new Error("Email format is invalid");
  if (!fullName) throw new Error("Display name is required");
  if (!(password.length >= 12 && /[a-z]/u.test(password) && /[A-Z]/u.test(password) && /\d/u.test(password) && /[^A-Za-z0-9]/u.test(password))) {
    throw new Error("Password must be at least 12 characters and include lowercase, uppercase, number, and symbol");
  }

  let user = await findUserByEmail(admin, email);
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...user.user_metadata, full_name: fullName }
    });
    if (error) throw error;
    user = data.user;
    console.log(`Updated existing Auth user: ${email}`);
  } else {
    const { count, error: countError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(`Cannot read profiles. Run database migrations first: ${countError.message}`);

    const { data: settings, error: settingsError } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "max_users")
      .single();
    if (settingsError) throw new Error(`Cannot read app_settings. Run database migrations first: ${settingsError.message}`);

    const maxUsers = Number(settings.value || 10);
    if ((count ?? 0) >= maxUsers) throw new Error(`User limit reached (${maxUsers})`);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created Auth user: ${email}`);
  }

  const requestedRole = String(argument("role") || "").trim().toLowerCase();
  if (requestedRole && !["owner", "admin"].includes(requestedRole)) {
    throw new Error("--role must be owner or admin");
  }
  const { count: ownerCount, error: ownerCountError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("active", true);
  if (ownerCountError) throw new Error(`Cannot determine Owner status. Run Migration 014 first: ${ownerCountError.message}`);
  const role = requestedRole || ((ownerCount ?? 0) === 0 ? "owner" : "admin");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: user.id,
      email,
      full_name: fullName,
      role,
      active: true,
      status: "active",
      must_change_password: false
    }, { onConflict: "id" })
    .select("id,email,full_name,role,active,status")
    .single();

  if (profileError) throw new Error(`Auth user exists but profile could not be saved: ${profileError.message}`);

  console.log("Owner/Admin setup completed successfully:");
  console.log(profile);
} catch (error) {
  console.error(`Admin setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl?.close();
}
