import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/password.mjs";

if (stdin.isTTY) {
  console.error("Passwort über die Standardeingabe übergeben, nicht als Kommandozeilenargument.");
  process.exit(1);
}

let password = "";
stdin.setEncoding("utf8");
for await (const chunk of stdin) password += chunk;
password = password.replace(/[\r\n]+$/, "");
stdout.write(`${await hashPassword(password)}\n`);
