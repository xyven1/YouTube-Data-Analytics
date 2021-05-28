import fs from "fs"
import google from "googleapis"
import moment from "moment"
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'))

var SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube-nodejs-quickstart.json';

function groupBy(list) {
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
  var videosWatchCount = [...groupBy(videos).entries()].sort((a, b) => b[1] - a[1])

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
  var localVideoData = JSON.parse(fs.readFileSync('videoData.json', 'utf8'))
  var videos = videoData.match(/(?<=href="https:\/\/www.youtube.com\/watch\?v=)([^"]+)/g)
  var videosWatchCount = [...groupBy(videos).entries()].sort((a, b) => b[1] - a[1])

  console.log()
}
