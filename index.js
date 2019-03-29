const chalk = require('chalk')
const discord = require('discord.js')
const fs = require('fs')
const randomColor = require('randomcolor')
const rp = require('request-promise-native')

const configFile = `${__dirname}/config.json`
const config = require(configFile)

const client = new discord.Client()

let statusChannel, proxyArray, proxyIndex=0
const proxyFile = `${__dirname}//proxies.txt`

const chalkConfig = {"cERR":chalk.red, "cWARN":chalk.yellow, "cINFO":chalk.blue, "cGOOD":chalk.green, "cFATAL":chalk.bgRed, "cIGN":chalk.grey, "cUNKWN":chalk.white}

const consoleLog = (msg="Unknown Status",type="UNKWN",postToDiscord=false) => {
    console.log(chalkConfig[`c${type}`](`${new Date().toISOString().slice(0,19).replace('T',' ')} [${type}]: `) + msg)
    if (postToDiscord == true && statusChannel != null) statusChannel.send(`${new Date().toISOString().slice(0,19).replace('T',' ')} [${type}]: ${msg}`)
    if (type == "FATAL") return process.exit()
}

const isEmpty = (obj) => {
    return (!obj || 0 === obj.length || 0 === Object.keys(obj).length)
}

const checkConfig = () => {
    //Make sure config file isn't missing any necessary fields.
    let reqConfig = ["allowedRoles", "commandName", "commandPrefix", "discordToken"]
    const checkDepth = (cObj, ci=0) => {
        for (cVar in cObj){
            if (cObj.hasOwnProperty(cVar)){
                if (typeof cObj[cVar] == "object" && !Array.isArray(cObj[cVar])) checkDepth(cObj[cVar], ci+1)
                else if (reqConfig.indexOf(cVar) >= 0 && isEmpty(cObj[cVar])) consoleLog(`Configuration value "${cVar}" is missing, check "config.json". Exiting process!`, "FATAL")
                else if (reqConfig.indexOf(cVar) >= 0) reqConfig.splice(reqConfig.indexOf(cVar), 1)
            }
        }
    }
    checkDepth(config)
    if (reqConfig.length > 0) consoleLog(`Configuration value(s) "${reqConfig.join('" & "')}" missing, check "config.json". Exiting process!`, "FATAL")
    config.allowedRoles.forEach((role, i) => {config.allowedRoles[i] = role.toLowerCase()})
    fs.writeFile(configFile, JSON.stringify(config, null, 4), (err) => {
        if (err) consoleLog(`Error writing ${configFile}: ${err.message}`, 'ERR')
    })
}

const loadProxy = () => {
    let rawProxies = fs.readFileSync(proxyFile, {encoding:'utf8',flag:'a+'})
    if (isEmpty(rawProxies)){
        consoleLog(`Proxies are missing, check "proxies.txt"`, "WARN")
    } else proxyArray = rawProxies.split(/\r\n|\n|\r/g)
}

const cycleProxy = (err=null) =>{
    if (err != null){
        if (proxyIndex < proxyArray.length) proxyIndex++
        else proxyIndex = 0
    }
    let newProxy = formatProxy(proxyArray[proxyIndex])
    if (isEmpty(newProxy)){ //Check if proxy line is empty, remove from list, and re-save proxies.txt
        proxyArray.splice(proxyIndex, 1)
        fs.writeFile(proxyFile, proxyArray.join('\n'), {encoding:'utf8'})
        return cycleProxy(true)
    }
    if (proxyIndex < proxyArray.length) proxyIndex++
    else proxyIndex = 0
    return newProxy
}

const formatProxy = (proxy) => {
    if (proxy == null) return null
    let formattedProxy
    if (proxy.match(/^([\w\.]+):(\d+):(\S+[^:]):(\S+[^:])$/) != null){
        let proxySplit = proxy.match(/^([\w\.]+):(\d+):(\S+[^:]):(\S+[^:])$/)
        formattedProxy = `http://${proxySplit[3]}:${proxySplit[4]}@${proxySplit[1]}:${proxySplit[2]}` //User:Pass auth formatted proxy
    } else if (proxy.match(/^([\w\.]+):(\d+)$/) != null){
        let proxySplit = proxy.match(/^([\w\.]+):(\d+)$/)
        formattedProxy = `http://${proxySplit[1]}:${proxySplit[2]}`
    }
    else formattedProxy = proxy
    return formattedProxy
}

const getVariants = async (productUrl) => {
    let thisProxy
    if (proxyArray.length > 0) thisProxy = await cycleProxy()
    else thisProxy = null
    consoleLog(`Looking up ${productUrl} using proxy ${thisProxy}`, 'INFO')
    let options = {
        method: 'GET',
        uri: `${productUrl}.json`,
        json: true,
        proxy: thisProxy,
        timeout: 10000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.86 Safari/537.36'
        }
    }
    return rp(options)
    .then( async (shopifyData) => {
        let baseShopUrl = productUrl.match(/^.+?[^\/:](?=[?\/]|$)/)[0]
        let shopifyEmbed = new discord.RichEmbed()
        .setAuthor('Shopify Release Info')
        .setTitle(productUrl)
        .setURL(productUrl)
        .setColor(randomColor())
        .setDescription(shopifyData.product.title)
        .setThumbnail(shopifyData.product.image.src)
        .setImage(shopifyData.product.image.src)
        .setFooter('Shopify Release Info \u200b | \u200b @codeByAndar')
        .setTimestamp(new Date().getTime())
        .addField('Price', '$'+shopifyData.product.variants[0].price,false)
        let linkGroupA = '', linkGroupB = '', totalStock = 0, atcTitle
        for (let i=0; i < shopifyData.product.variants.length; i++){
            let thisSize = shopifyData.product.variants[i].title
            let thisVariant = shopifyData.product.variants[i]
            let cartLink = `${baseShopUrl}/cart/${thisVariant.id}:1`
            let thisLinkString
            if (thisVariant.inventory_quantity >= 0){
                thisLinkString = `[Size ${thisSize}](${cartLink}): ${thisVariant.id} - [${thisVariant.inventory_quantity}]\n`
                totalStock += thisVariant.inventory_quantity
            } else if (thisVariant.old_inventory_quantity >= 0){
                thisLinkString = `[Size ${thisSize}](${cartLink}): ${thisVariant.id} - [${thisVariant.old_inventory_quantity}]\n`
                totalStock += thisVariant.old_inventory_quantity
            } else thisLinkString = `[Size ${thisSize}](${cartLink}): ${thisVariant.id}\n`
            if (i < 11) linkGroupA = linkGroupA.concat(thisLinkString)
            else linkGroupB = linkGroupB.concat(thisLinkString)
        }
        if (totalStock > 0){
            shopifyEmbed.addField('Total Stock', totalStock, false)
            atcTitle = 'ATC Links, Variants, & Stock:'
        } else atcTitle = 'ATC Links & Variants:'
        shopifyEmbed.addField(atcTitle, linkGroupA, true)
        if (linkGroupB) shopifyEmbed.addField(atcTitle, linkGroupB, true)
        return shopifyEmbed
    })
    .catch (err => {
        if (err.statusCode) err = err.statusCode
        consoleLog(`Error checking URL [${productUrl}] - ${err}`, "ERR")
        return 'An error occured. If this continues, ATC data may not be available.'
    })
}

client.on('error', (err) => consoleLog(err.message,'ERR'))

client.on('ready', () => {
    if (config.statusChannel != null) statusChannel = client.channels.find(ch => ch.name == config.statusChannel)
    consoleLog('Shopify variant link generator started!', "INFO", true)
})

client.on('message', async (message) => {
    if (message.content.indexOf(config.commandPrefix) != 0) return //If message does not have command prefix.
    if (message.author.bot) return //Ignore commands sent by bot users.
    else if (message.member.roles.some(role => config.allowedRoles.includes(role.name.toLowerCase())) == false) return //Don't allow commands from unauthorized users.
    
    let cArgs = message.content.slice(config.commandPrefix.length).trim().split(/ +|\n/g)
    let command = cArgs.shift().toLowerCase()

    if (cArgs.length <= 0) consoleLog('Missing lookup link.', 'WARN')
    else if (command == config.commandName){
        getVariants(cArgs[0]).then((shopifyResponse) => {
            message.channel.send(shopifyResponse)
        })
    } else return //If the command is not used by this bot.

    consoleLog(`Allowed command ${command} from ${message.member.user.username}`, 'INFO')
    message.delete(250)
})

checkConfig()
loadProxy()

client.login(config.discordToken)