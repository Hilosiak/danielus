import { Client, TextChannel, Message, Guild } from "discord.js";
import https from 'https';
import crypto from 'crypto';

interface GiftInfo {
    user: {
        id: string
        username: string
        avatar: string
        discriminator: string
    }
    store_listing: {
        sku: {
            name: string
        }
    }
}

export default class Scanner extends Client {
    public readonly id = crypto.randomBytes(16).toString("hex");
    private readonly logId: string;
    private readonly logGuildId: string;
    private readonly redeemToken: string;
    private ignoreClassic: boolean;
    private scanners: Scanner[];
    private logChannel: TextChannel;
    private sharedUsedList: string[];
    private lastMessage: Message;
    private readonly giftRegex = /discord\.gift\/([\d\w]{1,19})(?: |$)/im;

    constructor(token: string, rToken: string, logId: string, logGuildId: string, ignore: number, uList: string[], scanners: Scanner[]) {
        super();
        ///@ts-ignore
        const orgF = this.dataManager.newChannel;
        ///@ts-ignore
        this.dataManager.newChannel = (d, g) => [0,1,2,3,4,5,6].includes(d.type) && orgF.call(this.dataManager, d, g);
        ///@ts-ignore
        const orgA = this.actions.MessageCreate.handle;
        ///@ts-ignore
        this.actions.MessageCreate.handle = data => this.channels.get(data.channel_id).type != "voice" && orgA.call(this.actions.MessageCreate, data);
        this.token = token;
        this.redeemToken = rToken;
        this.logId = logId;
        this.logGuildId = logGuildId;
        this.ignoreClassic = Boolean(ignore);
        this.sharedUsedList = uList;
        this.scanners = scanners;
        this.start();
    }

    private start() {
        super.login(this.token);
        this.on('ready', () => this.onReady());
        this.on('message', msg => this.onMessage(msg));
        this.on('guildCreate', g => this.checkDupeGuild(g));
    }

    private onReady() {
        console.log(`Zalogowano jako ${this.user.tag}`);
        this.logChannel = this.channels.get(this.logId) as TextChannel;
        this.user.setActivity(new Date().toUTCString());
    }

    public async getGuilds() {
        while(!this.readyAt)
            await new Promise(r => setTimeout(r, 100));
            
        return this.guilds.array();
    }

    private async checkDupeGuild(guild: Guild) {
        for(let s of this.scanners.filter(s => s.id != this.id))
            if((await s.getGuilds()).map(g => g.id).includes(guild.id)) {
                this.logChannel.send(`❌ Na serwerze **${guild.name}** znajdują się już inni szpiedzy.\nOpuściłxm ten serwer.`);
                guild.leave();
            }
    } 

    private async onMessage(msg: Message) {
        if(msg.guild?.id == this.logGuildId) {
            this.handleCommands(msg);
            return;
        }
        
        this.lastMessage = msg;
        
        let test = this.giftRegex.exec(msg.content);
        if(test) {
            let giftCode = test[1];
            if(this.sharedUsedList.includes(giftCode))
                return;
            this.sharedUsedList.push(giftCode);
    
            if(giftCode.length == 16)
                this.redeemCode(giftCode);
            else if(giftCode.length > 16)
                this.redeemCode(giftCode.slice(0, 16));
            else {
                let words = msg.content.replace(/[^0-9A-Za-z ]/g, '').split(' ').filter(s => (giftCode + s).length == 16);
                if(words.length == 0)
                    return;
                (async () => {
                    for(let word of words) {
                        this.redeemCode(giftCode + word);
                        await new Promise(r => setTimeout(r, 100));
                    }
                })();
            }
            
            this.logChannel.send(msg.content?.replace(/@everyone/g, '')?.replace(/@here/g, ''));
            this.logChannel.send(`od: **@${msg.author.tag}**\nw **#${(msg.channel as TextChannel)?.name || 'DM'}**\nna **${msg.guild?.name || 'DM'}**\nping **${this.ping} ms**`);
        }
    }

    private handleCommands(msg: Message) {
        if(msg.content.startsWith('...stats')) {
            msg.channel.send(`__**Statystyki:**__
            
**Serwery:** ${this.guilds.size}
**Kanały:** ${this.channels.size}
**W filtrze:** ${this.sharedUsedList.length}
**Ost. wiad.:**
**${this.lastMessage.author.tag}** w **${this.lastMessage?.guild.name || 'DM'}**
${this.lastMessage?.cleanContent?.slice(0, 1000)}`
            );
        }
        else if(msg.content.startsWith('...ping')) {
            msg.channel.send(`✅ **${msg.author.tag}** :ping_pong: ${this.ping}ms`);
        }
        else if(msg.content.startsWith('...ignore')) {
            msg.channel.send(`Ignorowanie Nitro Classic (i śmieci) jest **${this.ignoreClassic ? 'włączone' : 'wyłączone'}**`);
        }
    }

    private async redeemCode(code: string) {
        try {
            if(this.ignoreClassic) {
                let info = (await this.getGiftCreatorInfo(code))?.store_listing?.sku?.name;
                if(!info || info == "Nitro Classic") {
                    this.logChannel.send(`**Zignorowano ${info ? "Nitro Classic" : "śmiecia"}.**\n${code}`);
                    return;
                }
            }

            let rq = https.request({
                hostname: 'discordapp.com',
                port: 443,
                path: `/api/v6/entitlements/gift-codes/${code}/redeem`,
                method: 'POST',
                headers: {
                    Authorization: this.redeemToken, 
                    'Content-Type': 'application/json',
                }
            }, resp => {
                let body = '';
                resp.on('data', d => body += d);
                resp.on('end', async () => {
                    this.logChannel.send(`kod: **${code}**`);
                    let gift = JSON.parse(body);
                    if(gift.code == 50050) {
                        let gifter = (await this.getGiftCreatorInfo(code)).user;
                        this.logChannel.send(`gifter: **@${gifter.username}#${gifter.discriminator}**`);
                    }
                    this.logChannel.send("Wynik próby odebrania prezentu:\n\n" + JSON.stringify(gift, null, 2), {code: 'json', split: true});
                    if(gift.id)
                        this.logChannel.send("@everyone");
                });
                
            });
            rq.write(`{
                "channel_id": null,
                "payment_source_id": null
            }`);
            rq.end();
        }
        catch(err) {
            console.error(err);
            this.logChannel.send(`Request error:\n\n` + err);
        }
    }

    private getGiftCreatorInfo(code: string): Promise<GiftInfo> {
        return new Promise(res => {
            https.get(`https://discordapp.com/api/v6/entitlements/gift-codes/${code}`, resp => {
                let body = '';
                resp.on('data', d => body += d);
                resp.on('end', () => {
                    res(JSON.parse(body));
                });
            });
        });
    }
}