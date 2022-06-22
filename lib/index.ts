import Scanner from './GiftScanner';
require('dotenv').config();

const tokens = process.env.TOKENS.split(',');
const sharedCodesList: string[] = [];

let missVars = ['TOKENS', 'REDTOKEN', 'LOGCHANNELID', 'LOGGUILDID', 'IGNORE_CLASSIC'].filter(v => !process.env[v]);
if(missVars.length != 0)
    throw Error("Missing some requred variables: " + missVars.join(", "));

let scanners: Scanner[] = [];

tokens.forEach((token, i) => {
    console.log(`Initializing ${i+1} of ${tokens.length} scanners...`);
    scanners.push(new Scanner(
        token,
        process.env.REDTOKEN,
        process.env.LOGCHANNELID,
        process.env.LOGGUILDID,
        +process.env.IGNORE_CLASSIC,
        sharedCodesList,
        scanners
    ));
});

(async () => {
    let guilds: {[prop: string]: {name: string, spies: Scanner[]}} = {};
    let emsg = '';

    for(let scan of scanners)
        for(let g of await scan.getGuilds()) {
            if(g.id == process.env.LOGGUILDID) continue;
            if(!guilds[g.id]) guilds[g.id] = { name: g.name, spies: [] };
            guilds[g.id].spies.push(scan);
        }

    for(let e of Object.values(guilds))
        if(e.spies.length > 1)
            emsg += `${e.name}: ${e.spies.map(s => s.user.tag).join(', ')}\n`;

    if(emsg)
        throw Error('Found duplicate guild(s):\n' + emsg + '\nGUILDS CAN\'T BE DUPLICATED AMONGST SCANNERS');
})().catch(e => {console.error(e); process.exit()});