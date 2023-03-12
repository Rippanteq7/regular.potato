process.on('uncaughtException', console.error)

import pino from 'pino'
import axios from 'axios'
import baileys from '@adiwajshing/baileys'

async function startSocket(authFolder) {
	let authState = await baileys.useMultiFileAuthState(authFolder)
	
	let conn = baileys.default({
		printQRInTerminal: true,
		logger: pino({ level: 'silent' }),
		auth: authState.state
	})
	
	conn.ev.process(async (ev) => {
		if (ev['connection.update']) {
			let up = ev['connection.update']
			if (up.connection == 'close') {
				startSocket(authFolder)
			} else if (up.connection == 'open') {
				conn.user.jid = baileys.jidNormalizedUser(conn.user.id)
			}
			console.log(up)
		}
		
		if (ev['messages.upsert']) {
			let up = ev['messages.upsert']
			// console.log(JSON.stringify(up, '', 2))
			if (up.type == 'notify') {
				for (let m of up.messages) {
					let sender = m.key.remoteJid, userJid = conn.user.jid
					let msg = m.message?.videoMessage?.caption || m.message?.imageMessage?.caption || m.message?.extendedTextMessage?.text || m.message?.conversation || ''
					if (sender == userJid && msg) {
						console.log('\u001b[105m[' + new Date().toLocaleTimeString('id', { timeZone: 'Asia/Jakarta' }) + ']\u001b[49m', 'Received text:', msg)
						let data = await translate(msg)
						let audio = await speech(data)
						await conn.sendMessage(userJid, { text: `${data}\n\n${await toRomaji(data)}` }, { quoted: m })
						await baileys.delay(1000)
						await conn.sendMessage(userJid, { audio, mimetype: 'audio/mpeg' }, { quoted: m })
					}
				}
			}
		}
		
		if (ev['creds.update']) {
			await authState.saveCreds()
		}
	})
	
	return conn
}

async function speech(text) {
	let parts = text.match(/[\s\S]{1,100}(?!\S)|[\s\S]{1,100}/g).map(e => e.trim())
	let buff = Buffer.concat(await Promise.all(parts.map((e, i) => axios.get(`http://translate.google.com/translate_tts?ie=UTF-8&tl=ja&q=${encodeURIComponent(e)}&total=${e.length}&idx=${i}&client=tw-ob&textlen=${e.length}`, { responseType: 'arraybuffer' }).then(r => r.data).then(b => Buffer.from(b)))))
	return buff
}

async function translate(text) {
	let url = new URL('https://translate.googleapis.com/translate_a/single')
	url.search = (new URLSearchParams({
		client: 'gtx', sl: 'id-ID', tl: 'ja', dt: 't', dj: '1', q: text
	})).toString()
	let resp = await axios.get(url.toString())
	return resp.data.sentences.map((s) => s.trans).join('')
}

async function toRomaji(text) {
	return (await axios.post('https://api.kuroshiro.org/convert', { str: text, to: 'romaji', mode: 'spaced', romajiSystem: 'hepburn' })).data.result
}

startSocket(process.argv[2] || 'session')
