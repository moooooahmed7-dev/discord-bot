require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} = require("@discordjs/voice");

const play = require("play-dl");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("عرض أوامر البوت"),
  new SlashCommandBuilder().setName("ping").setDescription("فحص سرعة البوت"),
  new SlashCommandBuilder().setName("serverinfo").setDescription("معلومات السيرفر"),
  new SlashCommandBuilder().setName("userinfo").setDescription("معلومات عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(false)),
  new SlashCommandBuilder().setName("clear").setDescription("مسح رسائل")
    .addIntegerOption(o => o.setName("amount").setDescription("عدد الرسائل 1-100").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("kick").setDescription("طرد عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(false)),
  new SlashCommandBuilder().setName("ban").setDescription("حظر عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(false)),
  new SlashCommandBuilder().setName("timeout").setDescription("كتم عضو مؤقتًا")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("المدة بالدقائق").setMinValue(1).setMaxValue(40320).setRequired(true)),
  new SlashCommandBuilder().setName("join").setDescription("دخول الروم الصوتي الذي أنت فيه"),
  new SlashCommandBuilder().setName("leave").setDescription("الخروج من الروم الصوتي"),
  new SlashCommandBuilder().setName("play").setDescription("تشغيل أغنية من رابط أو اسم")
    .addStringOption(o => o.setName("query").setDescription("رابط أو اسم الأغنية").setRequired(true)),
  new SlashCommandBuilder().setName("pause").setDescription("إيقاف الصوت مؤقتًا"),
  new SlashCommandBuilder().setName("resume").setDescription("استكمال الصوت"),
  new SlashCommandBuilder().setName("stop").setDescription("إيقاف الصوت"),
  new SlashCommandBuilder().setName("skip").setDescription("تخطي المقطع الحالي"),
  new SlashCommandBuilder().setName("volume").setDescription("تغيير مستوى الصوت")
    .addIntegerOption(o => o.setName("percent").setDescription("من 1 إلى 100").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("quran").setDescription("تشغيل سورة قرآن من رابط صوتي مباشر")
    .addStringOption(o => o.setName("url").setDescription("رابط ملف الصوت المباشر للسورة").setRequired(true)),
].map(c => c.toJSON());

const guildPlayers = new Map();
const quranPlayers = new Map();

function getPlayer(guildId) {
  let data = guildPlayers.get(guildId);
  if (!data) {
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    data = { player, connection: null, queue: [], current: null, volume: 0.75 };
    guildPlayers.set(guildId, data);
    player.on(AudioPlayerStatus.Idle, () => playNext(guildId).catch(console.error));
  }
  return data;
}

async function connectMember(interaction) {
  const channel = interaction.member?.voice?.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error("ادخل أنت الأول إلى Voice Channel.");
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: interaction.guild.id,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  return connection;
}

async function playNext(guildId) {
  const data = guildPlayers.get(guildId);
  if (!data || !data.queue.length) {
    if (data) data.current = null;
    return;
  }

  const item = data.queue.shift();
  data.current = item;

  let stream;
  try {
    stream = await play.stream(item.url, { discordPlayerCompatibility: false });
  } catch (err) {
    console.error(err);
    return playNext(guildId);
  }

  const resource = createAudioResource(stream.stream, {
    inputType: stream.type || StreamType.WebmOpus,
    inlineVolume: true,
  });
  resource.volume.setVolume(data.volume);
  data.player.play(resource);
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  const app = await rest.get(Routes.oauth2CurrentApplication());
  await rest.put(Routes.applicationCommands(app.id), { body: commands });
  console.log("✅ Slash commands registered globally.");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("Command registration failed:", e.message);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const name = interaction.commandName;

    if (name === "ping") return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);

    if (name === "help") {
      return interaction.reply({
        ephemeral: true,
        content:
          "🤖 **أوامر البوت**\n" +
          "🎵 `/play` `/pause` `/resume` `/skip` `/stop` `/volume`\n" +
          "🔊 `/join` `/leave`\n" +
          "📖 `/quran` رابط صوت مباشر للسورة\n" +
          "🛡️ `/kick` `/ban` `/timeout` `/clear`\n" +
          "ℹ️ `/serverinfo` `/userinfo` `/ping`",
      });
    }

    if (name === "serverinfo") {
      return interaction.reply(
        `🏠 **${interaction.guild.name}**\n👥 الأعضاء: ${interaction.guild.memberCount}\n🆔 ${interaction.guild.id}`
      );
    }

    if (name === "userinfo") {
      const user = interaction.options.getUser("user") || interaction.user;
      return interaction.reply(`👤 ${user.tag}\n🆔 ${user.id}\n📅 الحساب: <t:${Math.floor(user.createdTimestamp / 1000)}:D>`);
    }

    if (name === "clear") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return interaction.reply({ content: "❌ تحتاج Manage Messages.", ephemeral: true });
      const amount = interaction.options.getInteger("amount");
      const deleted = await interaction.channel.bulkDelete(amount, true);
      return interaction.reply({ content: `🧹 تم حذف ${deleted.size} رسالة.`, ephemeral: true });
    }

    if (["kick", "ban", "timeout"].includes(name)) {
      const needed = name === "kick" ? PermissionFlagsBits.KickMembers :
                     name === "ban" ? PermissionFlagsBits.BanMembers :
                     PermissionFlagsBits.ModerateMembers;
      if (!interaction.member.permissions.has(needed))
        return interaction.reply({ content: "❌ ليس لديك صلاحية تنفيذ الأمر.", ephemeral: true });

      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: "❌ العضو غير موجود في السيرفر.", ephemeral: true });

      if (name === "kick") {
        await member.kick(interaction.options.getString("reason") || "بدون سبب");
        return interaction.reply(`👢 تم طرد ${user.tag}.`);
      }

      if (name === "ban") {
        await member.ban({ reason: interaction.options.getString("reason") || "بدون سبب" });
        return interaction.reply(`🔨 تم حظر ${user.tag}.`);
      }

      const minutes = interaction.options.getInteger("minutes");
      await member.timeout(minutes * 60 * 1000, "تم بواسطة أمر البوت");
      return interaction.reply(`🔇 تم كتم ${user.tag} لمدة ${minutes} دقيقة.`);
    }

    if (name === "join") {
      const connection = await connectMember(interaction);
      const data = getPlayer(interaction.guild.id);
      data.connection = connection;
      connection.subscribe(data.player);
      return interaction.reply("🔊 دخلت الروم الصوتي.");
    }

    if (name === "leave") {
      const data = guildPlayers.get(interaction.guild.id);
      if (data?.connection) data.connection.destroy();
      guildPlayers.delete(interaction.guild.id);
      return interaction.reply("👋 خرجت من الروم الصوتي.");
    }

    if (name === "play") {
      const query = interaction.options.getString("query", true);
      const connection = await connectMember(interaction);
      const data = getPlayer(interaction.guild.id);
      data.connection = connection;
      connection.subscribe(data.player);

      let url = query;
      let title = query;

      if (!play.yt_validate(query)) {
        const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
        if (!results.length) return interaction.reply("❌ مش لاقي الأغنية.");
        url = results[0].url;
        title = results[0].title;
      } else {
        const info = await play.video_basic_info(query);
        title = info.video_details.title;
      }

      data.queue.push({ url, title });
      if (data.player.state.status === AudioPlayerStatus.Idle) await playNext(interaction.guild.id);

      return interaction.reply(`🎵 تمت إضافة: **${title}**`);
    }

    if (name === "pause") {
      const data = getPlayer(interaction.guild.id);
      return interaction.reply(data.player.pause() ? "⏸️ تم الإيقاف المؤقت." : "❌ لا يوجد صوت يعمل.");
    }

    if (name === "resume") {
      const data = getPlayer(interaction.guild.id);
      return interaction.reply(data.player.unpause() ? "▶️ تم الاستكمال." : "❌ لا يوجد صوت متوقف مؤقتًا.");
    }

    if (name === "stop") {
      const data = getPlayer(interaction.guild.id);
      data.queue = [];
      data.current = null;
      data.player.stop();
      return interaction.reply("⏹️ تم إيقاف التشغيل.");
    }

    if (name === "skip") {
      const data = getPlayer(interaction.guild.id);
      data.player.stop();
      return interaction.reply("⏭️ تم التخطي.");
    }

    if (name === "volume") {
      const data = getPlayer(interaction.guild.id);
      const percent = interaction.options.getInteger("percent");
      data.volume = percent / 100;
      return interaction.reply(`🔊 مستوى الصوت: ${percent}%`);
    }

    if (name === "quran") {
      const url = interaction.options.getString("url", true);
      const connection = await connectMember(interaction);
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      const resource = createAudioResource(url, { inlineVolume: true });
      resource.volume.setVolume(0.8);
      connection.subscribe(player);
      player.play(resource);
      quranPlayers.set(interaction.guild.id, { connection, player });
      return interaction.reply("📖 بدأ تشغيل القرآن.");
    }
  } catch (err) {
    console.error(err);
    const message = `❌ حصل خطأ: ${err.message || "خطأ غير معروف"}`;
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: message, ephemeral: true });
    else await interaction.reply({ content: message, ephemeral: true });
  }
});

client.login(process.env.TOKEN);
