const discord = require('discord.js')
const request = require('request')
const randomColor = require('randomcolor')
const config = require('./config.json')

const client = new discord.Client()

function consoleLog(msg,type){
    console.log(new Date().toISOString().slice(0,19).replace('T',' ')+' ['+type+']: '+msg)
}

function getVariants(url, channel){
    let productUrl = String(url).match(/(https?:\/\/\S*)[^\/]/)[0]
    request({
        url: productUrl + '.json',
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36'
        }},
        function(err, resp, data){
            if (err) return consoleLog(err.message, "ERR")
            else if (resp.statusCode == 404) return channel.send("404 Error. Check your link and try again.").then(warn => warn.delete(7500))
            let productData
            try {
                productData = JSON.parse(data).product
            } catch (e){
                return consoleLog("JSON Parse Error", "ERR")
            }
            let baseUrl = productUrl.match(/^.+?[^\/:](?=[?\/]|$)/)[0]
            let atcLinks = {}
            let shopifyEmbed = new discord.RichEmbed()
            .setAuthor('Shopify ATC Links')
            .setTitle(productUrl)
            .setURL(productUrl)
            .setColor(randomColor())
            .setDescription(productData.title)
            .setThumbnail(productData.image.src)
            .setImage(productData.image.src)
            .setFooter('Shopify ATC Link Generator by andar')
            .setTimestamp(new Date().getTime())
            .addField('Price', '$'+productData.variants[0].price,false)
            let linkStringA = ''
            let linkStringB = ''
            for (let i = 0; i < productData.variants.length; i++){
                let sizeFound = productData.variants[i].title
                let cartLink = (baseUrl + '/cart/' + productData.variants[i].id + ':1')
                atcLinks[sizeFound] = cartLink
                let productStock
                if (productData.variants[i].inventory_quantity >= 0) productStock = productData.variants[i].inventory_quantity
                else productStock = '?' // If stock quantity is not defined, set N/A instead
                if (i <= 11) linkStringA = linkStringA.concat('[Size ' + sizeFound + '](' + cartLink + ') - [' + productStock + ']\n')
                else linkStringB = linkStringB.concat('[Size ' + sizeFound + '](' + cartLink + ') - [' + productStock + ']\n')
            }
            shopifyEmbed.addField('ATC Links - [# in stock]', linkStringA, true)
            if (linkStringB) shopifyEmbed.addField('ATC Links - [# in stock]', linkStringB, true)
            channel.send(shopifyEmbed)
        }
    )
}

client.on('ready', () => {
    consoleLog('Shopify variant link generator started!', "INFO")
})

client.on('message', async (message) => {
    let args = message.content.slice(config.prefix.length).trim().split(/ +/g)
    let command = args.shift().toLowerCase()

    if (message.content.indexOf(config.prefix) !== 0) return //If message does not have command prefix.
    if (message.author.bot) return //Ignore commands sent by bot users.
    else if (message.member.roles.some(role => config.allowedRoles.includes(role.name.toLowerCase())) == false) return //Don't allow commands from unauthorized users.

    if (command === config.command) getVariants(args, message.channel)
    else return //If the command is not used by this bot.

    consoleLog('Allowed command "' + command + '" from ' + message.member.user.username, "INFO")
    message.delete(250)
})

client.login(config.discordToken)

client.on('error', (err) => consoleLog(err.message,'ERR'))