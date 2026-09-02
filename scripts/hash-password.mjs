import { pbkdf2Sync, randomBytes } from "crypto";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

const rl = createInterface({ input, output });
const password = await rl.question("Skriv det lösenord du vill använda: ");
rl.close();

if (!password || password.length < 10) {
  console.error("Välj minst 10 tecken.");
  process.exit(1);
}

const iterations = 310000;
const salt = randomBytes(16).toString("base64url");
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
console.log(`SINGLE_USER_PASSWORD_HASH=pbkdf2$${iterations}$${salt}$${hash}`);
