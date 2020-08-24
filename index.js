let superagent = require("superagent")
require('superagent-charset')(superagent)
let fs = require('fs')
let ProgressBar = require('progress')

async function getOuterUrls(url, CharFormat = 'utf-8') {
    return new Promise((resolve, reject) => {
        superagent.get(url)
        .buffer(true)
        .charset(CharFormat)
        .timeout({
          response: 5000,  // Wait 5 seconds for the server to start sending,
          deadline: 10000, // but allow 10 seconds for the file to finish loading.
        })
        .end((err, docs) => {
            if(err) {
                return reject(err);
            }
            // 成功解析
            resolve(docs);
        })
    })
}

function genWangYiNewObject(news) {
    let keywords = []
    if(news.keywords.length > 0) {
        for (let obj of news.keywords) {
            keywords.push(obj.keyname)
        }
    }
    return {
        title: news.title,
        keywords: keywords,
        docurl : news.docurl,
        source: '网易'
    }
}

function isWangYiAnyKeyWordMatch(re, list) {
    if (list.length > 0) {
        for (let keyword of list) {
            if (re.test(keyword.keyname)) {
                return true
            }
        }
    }
    return false
}

async function getWangYiNews2(re, Url) {
    try {
        let Docs = await getOuterUrls(Url, 'gbk')
        let newsJson = JSON.parse(Docs.res.text.toString().slice(14, -1))
        let final = []
        // 匹配标题
        for (let news of newsJson) {
            if(re.test(news.title)) {
                let simpleNewsObj = genWangYiNewObject(news)
                final.push(simpleNewsObj)
            } else if (isWangYiAnyKeyWordMatch(re, news.keywords)) {
                let simpleNewsObj = genWangYiNewObject(news)
                final.push(simpleNewsObj)
            }
        }
        return final
    } catch (err) {
        return []
    }
}

/* 
抓取网易新闻
逻辑：
请求url：url头 + 02 - 08(最多只能获取8页) + url尾。
提取数据： 去除返回的data_callback()，中间部分是JSON 
解析JSON：传入正则，使用正则匹配文章title或者keywords
{
    title: 标题,
    keywords: [标签],
    docurl: 文章url,
    ...
}
生成html表格
*/
async function getWangYiNews(re) {
    let allTag = [
        ['国内','http://temp.163.com/special/00804KVA/cm_guonei', '.js?callback=data_callback'],
        ['国际','http://temp.163.com/special/00804KVA/cm_guoji', '.js?callback=data_callback'],
        ['社会','http://temp.163.com/special/00804KVA/cm_shehui', '.js?callback=data_callback'],
        ['军事','http://temp.163.com/special/00804KVA/cm_war', '.js?callback=data_callback'],
        ['体育','http://sports.163.com/special/000587PR/newsdata_n_world', '.js?callback=data_callback'],
        ['娱乐','http://ent.163.com/special/000380VU/newsdata_index', '.js?callback=data_callback'],
        ['科技','http://tech.163.com/special/00097UHL/tech_datalist','.js?callback=data_callback']
    ]
    let final = []
    let bar = new ProgressBar(` spidering wangyi news total ${allTag.length * 8} url [:bar] :percent`, {
        complete: '=',
        incomplete: ' ',
        width: 50,
        total: allTag.length * 8
    });
    for (let Tag of allTag) {
        let result = await getWangYiNews2(re, Tag[1]+Tag[2])
        final = final.concat(result)
        bar.tick()
        for (let i = 2; i < 9; i++) {
            bar.tick()
            let result2 = await getWangYiNews2(re, Tag[1]+"_0"+String(i)+Tag[2])
            final = final.concat(result2)
        }
    }
    return final
}
/************************************** **********************************/
function genTencentObject(news) {
    let keywords = []
    if(news.tags.length > 0) {
        for (let obj of news.tags) {
            keywords.push(obj.tag_word)
        }
    }
    return {
        title: news.title,
        keywords: keywords,
        docurl : news.url,
        source: '腾讯'
    }
}

function isTencentKeyWordMatch(re, list) {
    if (list.length > 0) {
        for (let keyword of list) {
            if (re.test(keyword.tag_word)) {
                return true
            }
        }
    }
    return false
}

async function getTencentNews2(re, Url) {
    try {
        let Docs = await getOuterUrls(Url)
        let Ret = JSON.parse(Docs.res.text)
        // 可能返回失败的
        if (Ret.ret == 0) {
            let allAtricle = Ret.data.list
            let final = []
            // 匹配标题
            for (let article of allAtricle) {
                if(re.test(article.title)) {
                    let simpleNewsObj = genTencentObject(article)
                    final.push(simpleNewsObj)
                } else if (isTencentKeyWordMatch(re, article.tags)) {
                    let simpleNewsObj = genTencentObject(article)
                    final.push(simpleNewsObj)
                }
            }
            return final
        } else {
            return []
        }
    } catch (err) {
        console.log(err)
        return []
    }
}

/* 
抓取腾讯新闻
逻辑：
请求分类：固定url
{"chn":"体育","cid":"1","name":"sports"}
使用分类的name拼接请求url：url头 + sub_srv_id=name + url尾。
解析JSON：传入正则，使用正则匹配文章title或者keywords
{
    title: 标题,
    tags: [标签],
    docurl: 文章url,
    ...
}
生成html表格
*/
async function getTencentNews(re) {
    let BaseObj =
    {
        categories: 'https://pacaio.match.qq.com/vlike/categories',
        urlHead: 'https://i.news.qq.com/trpc.qqnews_web.kv_srv.kv_srv_http_proxy/list?sub_srv_id=',
        urlTail: '&srv_id=pc&offset=0&limit=199&strategy=1&ext={%22pool%22:[%22top%22],%22is_filter%22:7,%22check_type%22:true}'
    }
    // 补充一些可能没有但我有点想要抓的标签
    let supplement = [{
            chn: '政务',
            name: 'politics'
        }, 
        {
            chn: '政网法事',
            name: 'zf'
        }, 
        { 
            chn: '24小时热点',
            name: '24hours'
        }, 
        {
            chn: '理财', 
            name: 'licai'
        }, 
        {
            chn: '新国风',
            name: 'cul_ru'
        }]
    let Docs = await getOuterUrls(BaseObj.categories)
    let AllCategories = JSON.parse(Docs.res.text).data.concat(supplement)
    let final = []
    let bar = new ProgressBar(` spidering tencent news total ${AllCategories.length} url [:bar] :percent`, {
        complete: '=',
        incomplete: ' ',
        width: 50,
        total: AllCategories.length
    });
    for (let item of AllCategories) {
        bar.tick()
        let Result = await getTencentNews2(re, BaseObj.urlHead + item.name + BaseObj.urlTail)
        final = final.concat(Result)
    }
    return final
}

function makeJson2Table (newsJson) {
    console.log(`spide done !! sum up ${newsJson.length} news, you can open result.html to check out`)
    let head = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>QSY爬取结果</title></head><body><table style="border:solid 1px #000" rules="all" cellspacing="10" cellpadding="10"><tr><th>标题</th><th>关键词</th><th>来源</th></tr>`
    let tail = `</table></body></html>`
    let jb = ``
    let article = {}
    for (let news of newsJson) {
        if (article[news.docurl] == undefined) {
            let keywordStr = ``
            for (let word of news.keywords) {
                if (keywordStr == ``) {
                    keywordStr += word
                } else {
                    keywordStr = keywordStr + ', ' + word
                }
            }
            jb = jb + `<tr><td><a href="`+ news.docurl + `">` + news.title + `</a></td><td>` + keywordStr + `</td><td>` + news.source + `</td></tr>`
            article[news.docurl] = true
        }
    }
    return head + jb + tail
}

async function spideNews(re) {
    let WangYi = await getWangYiNews(re)
    let Tencent = await getTencentNews(re)
    let Sum = WangYi.concat(Tencent)
    let Str = makeJson2Table(Sum)
    fs.writeFile('result.html', Str, 'utf-8', err => {
        if(err) {console.log(err)}
    })
}

spideNews(/雄安.*/).then(result => {
}).catch(err => {
    console.log(err)
})