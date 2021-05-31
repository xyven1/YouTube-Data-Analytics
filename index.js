import fs from "fs"
import google from "googleapis"
import moment from "moment"
import momentDurationFormat from "moment-duration-format"

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'))

var SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube-nodejs-quickstart.json';

function countOccurnces(list) {
  const map = new Map()
  list.forEach(item => {
    map.set(item, (map.get(item)||0) + 1)
  })
  return map
}

function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret
  var clientId = credentials.installed.client_id
  var redirectUrl = credentials.installed.redirect_uris[0]
  var oauth2Client = new google.google.auth.OAuth2(clientId, clientSecret, redirectUrl)
  fs.readFile(TOKEN_PATH, function(err, token) {
    oauth2Client.credentials = JSON.parse(token);
    callback(oauth2Client);
  })
}
if(config.mode=="fetch"){
  fs.readFile('client_secret.json', function processClientSecrets(err, content) {
    authorize(JSON.parse(content), getData);
  })
}
else if(config.mode=="analyze"){
  analyzeData()
}

function getData(auth) {
  var service = google.google.youtube('v3');

  var videoData = fs.readFileSync(config.dataPath, 'utf8')
  var videos = videoData.match(/(?<=href="https:\/\/www.youtube.com\/watch\?v=)([^"]+)/g)
  var videosWatchCount = [...countOccurnces(videos).entries()].sort((a, b) => b[1] - a[1])

  var t0 = process.hrtime()

  var promises = Array.from(videosWatchCount.entries()).slice(config.start, config.start + config.number)
    .map(v=>new Promise((res,rej) => {
        service.videos.list({
          auth: auth,
          part: config.partsToFetch,
          id: v[1][0]
        }, (err, response) => {
          if (err) return rej(err)
          var videoData = response.data.items[0]
          if(videoData == null) return rej("Video no longer available")
          res(videoData)
        })
      }))
  console.log("Time to Intiate Promises:", `${process.hrtime(t0)[0]}s, ${process.hrtime(t0)[1]/1e6}ms`)
  Promise.allSettled(promises).then(val=> {
    fs.readFile('videoData.json', 'utf8', (err, data)=> {
      if(err) return console.log('Error reading videoData.json')
      var data = JSON.parse(data)||[]
      val.flatMap(v=>v.status=="fulfilled" ? [v.value] : []).forEach(v=>{
        if(!data.find(r=>r.id==v.id))
          data.push(v)
      })
      fs.writeFileSync('videoData.json', JSON.stringify(data), (err) => console.log(err??"Saved"))
    })
    console.log("Time to retrieve and save data:", `${process.hrtime(t0)[0]}s, ${process.hrtime(t0)[1]/1e6}ms`)
  }).catch(err=>console.log(err))
}

function analyzeData(){
  var videoData = fs.readFileSync(config.dataPath, 'utf8')
  var categoryIdMap = JSON.parse(fs.readFileSync('videoCategoryIdList.json'))
  var apiVideoData = JSON.parse(fs.readFileSync('videoData.json', 'utf8'))
  var videos = videoData.match(/(?<=href="https:\/\/www.youtube.com\/watch\?v=)([^"]+)/g)
  var videosWatchCount = countOccurnces(videos)
  
  var restructuredData = apiVideoData.map(v=>({
    id: v.id,
    durationS: moment.duration(v.contentDetails.duration).asSeconds(),
    type: v.liveStreamingDetails ? 'livestream' : 'video',
    category: categoryIdMap[v.snippet.categoryId||0],
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    viewCount: v.statistics.viewCount,
    publishedAt: Date.parse(v.snippet.publishedAt),
    watchCount: videosWatchCount.get(v.id)
  }))
  var totalTime = moment.duration(restructuredData.reduce((a, v)=> a + (v.type=='video')*v.durationS, 0),  'seconds')
  var totalTimeByCategory = Object.fromEntries(Object.entries(restructuredData.reduce((a,v)=>{
    if(v.type=='video') a[v.category] = a[v.category] ? a[v.category] + v.durationS : v.durationS
    return a
  }, {})).sort(([,a],[,b]) => b-a).map(v=>[v[0], moment.duration(v[1], 's').format("h [hrs], m [min]")]))
  console.log(`Total watch time: ${totalTime.format()} or ${totalTime.format("h [hrs], m [min]")}
${JSON.stringify(totalTimeByCategory, null, 2)}`)
}
