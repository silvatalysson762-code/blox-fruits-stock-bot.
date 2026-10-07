require("dotenv").config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const archiver = require("archiver");
const fs = require("fs");
const path = require("path");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("Configure DISCORD_TOKEN e CLIENT_ID nas variáveis de ambiente.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const command = new SlashCommandBuilder()
  .setName("pegar-emojis")
  .setDescription("Gera um ZIP com todos os emojis desta aplicação.");

async function registerCommand() {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: [command.toJSON()]
  });
  console.log("Comando /pegar-emojis registrado.");
}

async function createEmojiZip() {
  const response = await fetch(`https://discord.com/api/v10/applications/${clientId}/emojis`, {
    headers: { Authorization: `Bot ${token}` }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord API respondeu ${response.status}. ${body}`);
  }

  const data = await response.json();
  const emojis = Array.isArray(data.items) ? data.items : [];

  if (!emojis.length) {
    throw new Error("Esta aplicação não possui emojis.");
  }

  const filePath = path.join("/tmp", `astral-emojis-${clientId}.zip`);
  const output = fs.createWriteStream(filePath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", () => resolve({ filePath, count: emojis.length }));
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);

    Promise.all(emojis.map(async emoji => {
      const extension = emoji.animated ? "gif" : "png";
      const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}?size=4096&quality=lossless`;
      const emojiResponse = await fetch(url);
      if (!emojiResponse.ok) throw new Error(`Falha ao baixar ${emoji.name || emoji.id}.`);
      const buffer = Buffer.from(await emojiResponse.arrayBuffer());
      archive.append(buffer, { name: `${emoji.name || emoji.id}.${extension}` });
    }))
      .then(() => archive.finalize())
      .catch(reject);
  });
}

client.once("ready", () => {
  console.log(`Logado como ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "pegar-emojis") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await createEmojiZip();

    await interaction.editReply({
      content: `✅ ZIP criado com **${result.count} emojis**.`,
      files: [{ attachment: result.filePath, name: "astral-emojis.zip" }]
    });

    fs.unlink(result.filePath, () => {});
  } catch (error) {
    console.error(error);
    await interaction.editReply({
      content: `❌ Não consegui acessar os emojis desta aplicação.\\n\\n${error.message}`
    });
  }
});

registerCommand()
  .then(() => client.login(token))
  .catch(error => {
    console.error("Erro ao iniciar:", error);
    process.exit(1);
  });
