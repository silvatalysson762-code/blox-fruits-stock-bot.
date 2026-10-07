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
  .setDescription("Gera um ZIP com todos os emojis do servidor selecionado.")
  .addStringOption(option =>
    option
      .setName("server_id")
      .setDescription("ID do servidor onde estão os emojis")
      .setRequired(true)
  );

async function registerCommand() {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), {
    body: [command.toJSON()]
  });
  console.log("Comando /pegar-emojis registrado.");
}

async function createEmojiZip(guild) {
  const emojis = await guild.emojis.fetch();

  if (!emojis.size) {
    throw new Error("Esse servidor não possui emojis que o bot consiga acessar.");
  }

  const filePath = path.join("/tmp", `astral-emojis-${guild.id}.zip`);
  const output = fs.createWriteStream(filePath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", () => resolve({ filePath, count: emojis.size }));
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);

    for (const emoji of emojis.values()) {
      const extension = emoji.animated ? "gif" : "png";
      const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}?size=4096&quality=lossless`;
      archive.append(require("https").get ? Buffer.alloc(0) : Buffer.alloc(0), { name: "placeholder" });
    }

    Promise.all([...emojis.values()].map(async emoji => {
      const extension = emoji.animated ? "gif" : "png";
      const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}?size=4096&quality=lossless`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Falha ao baixar ${emoji.name || emoji.id}.`);
      const buffer = Buffer.from(await response.arrayBuffer());
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
    const serverId = interaction.options.getString("server_id", true);
    const guild = await client.guilds.fetch(serverId);

    if (!guild) throw new Error("Servidor não encontrado.");

    const result = await createEmojiZip(guild);

    await interaction.editReply({
      content: `✅ ZIP criado com **${result.count} emojis**.`,
      files: [{ attachment: result.filePath, name: "astral-emojis.zip" }]
    });

    fs.unlink(result.filePath, () => {});
  } catch (error) {
    console.error(error);
    await interaction.editReply({
      content: `❌ Não consegui acessar os emojis desse servidor. Verifique se este bot está nele e tente novamente.\\n\\n${error.message}`
    });
  }
});

registerCommand()
  .then(() => client.login(token))
  .catch(error => {
    console.error("Erro ao iniciar:", error);
    process.exit(1);
  });
