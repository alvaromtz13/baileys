const { join } = require('path');
const { postCompletion } = require("./chatLLM");
const { chat, image2text } = require("./gemini");
const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MockAdapter = require('@bot-whatsapp/database/mock');
const dotenv = require('dotenv')
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs').promises;
const path = require('path');
const { saveToFile, readFromFile } = require('./fileHandler');

const assetsDir = path.join(__dirname, 'assets');
fs.mkdir(assetsDir, { recursive: true }).catch(console.error);

const dataDir = path.join(__dirname, 'data');
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

const flowText = addKeyword(EVENTS.WELCOME)
  .addAction(
    async (ctx, { flowDynamic }) => {
      try {
        const userMessage = ctx.body.toLowerCase();
        let response;

        if (userMessage.startsWith('guardar:')) {
          const [command, filename, ...contentArray] = userMessage.split(':');
          const content = contentArray.join(':').trim();
          const success = await saveToFile(`${filename}.txt`, content);
          response = success ? `Información guardada en ${filename}.txt` : "Hubo un error al guardar la información.";
        } else if (userMessage.startsWith('leer:')) {
          const [command, filename] = userMessage.split(':');
          const content = await readFromFile(`${filename.trim()}.txt`);
          response = content ? content : `No se pudo leer el archivo ${filename}.txt`;
        } else {
          const messages = [
            { "role": "system", "content": "Eres un asistente para una tienda de abarrotes, que ayudarás en cualquier cosa que te ordenen" },
            { "role": "user", "content": ctx.body }
          ];
          response = await postCompletion(messages);
        }

        await flowDynamic(response);
      } catch (error) {
        console.error("Error al procesar el mensaje de texto:", error);
        await flowDynamic("Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.");
      }
    }
  );



const flowMedia = addKeyword(EVENTS.MEDIA)
  .addAction(
    async (ctx, { flowDynamic, state }) => {
      console.log("Recibí un mensaje con posible contenido multimedia");
      try {
        let mediaMessage = null;
        let mediaType = '';

        // Verificar diferentes tipos de mensajes multimedia
        if (ctx.message.imageMessage) {
          mediaMessage = ctx.message.imageMessage;
          mediaType = 'image';
        } else if (ctx.message.videoMessage) {
          mediaMessage = ctx.message.videoMessage;
          mediaType = 'video';
        } else if (ctx.message.audioMessage) {
          mediaMessage = ctx.message.audioMessage;
          mediaType = 'audio';
        } else if (ctx.message.documentMessage) {
          mediaMessage = ctx.message.documentMessage;
          mediaType = 'document';
        } else if (ctx.message.stickerMessage) {
          mediaMessage = ctx.message.stickerMessage;
          mediaType = 'sticker';
        }

        // Verificar mensajes reenviados o citados
        if (!mediaMessage && ctx.message.extendedTextMessage?.contextInfo?.quotedMessage) {
          const quotedMessage = ctx.message.extendedTextMessage.contextInfo.quotedMessage;
          if (quotedMessage.imageMessage) {
            mediaMessage = quotedMessage.imageMessage;
            mediaType = 'image';
          } else if (quotedMessage.videoMessage) {
            mediaMessage = quotedMessage.videoMessage;
            mediaType = 'video';
          } else if (quotedMessage.audioMessage) {
            mediaMessage = quotedMessage.audioMessage;
            mediaType = 'audio';
          } else if (quotedMessage.documentMessage) {
            mediaMessage = quotedMessage.documentMessage;
            mediaType = 'document';
          } else if (quotedMessage.stickerMessage) {
            mediaMessage = quotedMessage.stickerMessage;
            mediaType = 'sticker';
          }
        }

        if (!mediaMessage) {
          throw new Error('No se encontró un mensaje multimedia válido');
        }

        // Descargar el mensaje multimedia
        const buffer = await downloadMediaMessage(
          { key: ctx.key, message: { [mediaType + 'Message']: mediaMessage } },
          'buffer',
          {}
        );

        // Determinar la extensión del archivo basada en el tipo MIME
        const mimeType = mediaMessage.mimetype;
        const extension = mimeType.split('/')[1];

        // Guardar el archivo multimedia
        const fileName = `media_${Date.now()}.${extension}`;
        const localPath = path.join(assetsDir, fileName);
        await fs.writeFile(localPath, buffer);
        
        let mediaInfo = '';
        // Procesar la imagen si es una imagen
        if (mediaType === 'image') {
          const imageText = await image2text("Leer el ticket o nota y sacar toda la información", localPath);
          mediaInfo = `Contenido de la imagen: ${imageText}`;
        } else {
          mediaInfo = `Archivo multimedia de tipo ${mediaType} recibido y guardado como ${fileName}`;
        }

        // Preparar el mensaje para postCompletion
        const messages = [
          { "role": "system", "content": "Eres un asistente para una tienda de abarrotes cual los empleados te usaran para guardar informacion o solicitarla, que ayudaras en cualquier cosa que te ordenen" },
          { "role": "user", "content": `Se ha recibido un mensaje multimedia. ${mediaInfo}` }
        ];

        // Procesar el mensaje con postCompletion
        const response = await postCompletion(messages);

        // Enviar la respuesta al usuario
        await flowDynamic(response);

      } catch (error) {
        console.error("Error al procesar el mensaje multimedia:", error);
        await flowDynamic("Lo siento, hubo un error al procesar el archivo multimedia. Por favor, intenta enviarlo de nuevo.");
      }
    }
  );

        
 
const main = async () => {
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([flowText, flowMedia])
    const adapterProvider = createProvider(BaileysProvider)

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()
}

main()