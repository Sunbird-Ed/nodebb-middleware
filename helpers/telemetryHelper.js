const Telemetry = require('sb_telemetry_util')
const telemetry = new Telemetry()
const _ = require('lodash')
const fs = require('fs')
const request = require('request');
const path = require('path');
const envHelper = require('./environmentVariablesHelper');
const telemtryEventConfig = JSON.parse(fs.readFileSync(path.join(__dirname, './telemetryEventConfig.json')))


module.exports = {

  /**
   * @description - To log the API Error event
   * @param  {} req
   * @param  {} res
   * @param  {} data
   * @param  {} proxyResData
   * @param  {} proxyRes
   * @param  {} resCode
   * @param  {} env
   */
  logTelemetryErrorEvent(req, data, proxyResData, proxyRes, resCode) {
    let telemetryObj = this.getTelemetryObject(proxyRes, data, proxyResData, resCode);
    const option = telemetry.getTelemetryAPIError(telemetryObj, proxyRes, telemtryEventConfig.default_channel);
    if (option) {
      let object = this.getTelemetryParams(req, option.edata);
      telemetry.error(object);
    }
  },

  /**
   * This function helps to log API entry event
   */
  logAPIEvent(req, uri) {
    const apiConfig = telemtryEventConfig.URL[uri] || {}
    if (req) {
      params = this.getParamsData(req, '', {}, uri)
    }
    const edata = telemetry.logEventData('api_call', 'TRACE', apiConfig.message, JSON.stringify(params))
    edata.message = JSON.stringify({ title: 'API Log', url: req.path })
    let object = this.getTelemetryParams(req, edata);
    telemetry.log(object);
  },

  getTelemetryParams(req, edata) {
    let object = {}
    const context = this.getContextData(req);
    const actor =  this.getTelemetryActorData(req);
    const logData = {
      edata: edata,
      context: _.pickBy(context, value => !_.isEmpty(value)),
      object: _.pickBy(object, value => !_.isEmpty(value)),
      actor: _.pickBy(actor, value => !_.isEmpty(value))
    }
    return logData;
  },

  /**
  * This function helps to get params data for log event
  */
  getParamsData(options, statusCode, resp, uri, traceid) {
    const apiConfig = telemtryEventConfig.URL[uri]
    let params = [
      { 'title': apiConfig && apiConfig.title },
      { 'category': apiConfig && apiConfig.category },
      { 'url': options.path || apiConfig && apiConfig.url },
      { 'duration': Date.now() - new Date(options.headers.ts) },
      { 'status': statusCode },
      { 'protocol': 'https' },
      { 'method': options.method },
      { 'traceid': traceid }
    ]
    if (resp) {
      params.push(
        { rid: resp.id },
        { size: resp.toString().length }
      )
    }
    return params
  },

  /**
  * This function helps to get actor data for telemetry
  */
  getTelemetryActorData(req) {
    var actor = {}
    if (req.session && req.session.userId) {
      actor.id = req.session && req.session.userId
      actor.type = 'User'
    } else {
      actor.id = req.headers['x-consumer-id'] || req.headers['x-authenticated-userid'] || telemtryEventConfig.default_userid
      actor.type = req.headers['x-consumer-username'] || telemtryEventConfig.default_username
    }
    actor.type = actor.type.charAt(0).toUpperCase() + actor.type.slice(1);
    return actor
  },

  /**
   * @param  {} proxyRes
   * @param  {} data
   * @param  {} proxyResData
   * @param  {} resCode
   */
  getTelemetryObject(proxyRes, data, proxyResData, resCode) {
    if (proxyRes.statusCode === 404) {
      if (data !== 'Not Found' && (typeof data) !== 'string') {
        telemetryObj = JSON.parse(proxyResData.toString('utf8'));
      } else {
        telemetryObj = resCode;
      }
    } else {
      if (resCode.params) {
        telemetryObj = resCode;
      } else {
        telemetryObj = JSON.parse(proxyResData.toString('utf8'));
      }
    }
    return telemetryObj;
  },
  getContextData(req) {
    const contextObj =  {
    channel:  _.get(req.headers, 'x-channel-id') || '',
    env: telemtryEventConfig.default_channel,
    cdata: [],
    pdata: { id: telemtryEventConfig.default_channel, pid:  _.get(req.headers, 'x-app-id') || '', ver: '1.0.0' },
    did: _.get(req.headers, 'x-device-id') || '',
    sid: _.get(req.headers, 'X-Session-Id') || _.get(req.headers, 'x-session-id') || ''
  };
  return contextObj;
},
logTelemetryAuditEvent(req, data) {
  // telemetry.audit(data);
  this.sendTelemetry(req, data, function (err, status) {
   if (err) {
     console.log('telemetry sync error from  portal', err)
   }
 })
},
prepareTelemetryRequestBody: function (req, eventsData) {
 var data = {
   'id': 'ekstep.telemetry',
   'ver': '3.0',
   'ts': Date.now(),
   'params': {
     'requesterId': req.headers['x-request-id'],
     'did': telemtryEventConfig.default_did,
     'msgid': req.headers['x-request-id']
   },
   'events': eventsData
 }
 return data
},
sendTelemetry: function (req, eventsData, callback) {
 /* istanbul ignore if  */
 if (!eventsData || eventsData.length === 0) {
   if (_.isFunction(callback)) {
     callback(null, true)
   }
 }
 var data = this.prepareTelemetryRequestBody(req, eventsData)
 var options = {
   method: 'POST',
   url: envHelper.TELEMETRY_SERVICE_LOCAL_URL + telemtryEventConfig.endpoint,
   headers: {
     'Content-Type': 'application/json',
     'Authorization': 'Bearer ' + envHelper.PORTAL_API_AUTH_TOKEN
   },
   body: data,
   json: true
 }
 console.log('Option Data: ', JSON.stringify(options))
 /* istanbul ignore next  */
 request(options, function (error, response, body) {
   if (_.isFunction(callback)) {
     /* istanbul ignore if  */
     if (error) {
       console.log('telemetry sync error while syncing  portal', error)
       callback(error, false)
     } else if (body && body.params && body.params.err) {
       /* istanbul ignore next  */
       console.log('telemetry sync error while syncing  portal', body.params.err)
       /* istanbul ignore next  */
       callback(body, false)
     } else {
       callback(null, true)
     }
   }
 })
},
}