/**
 * Created by lkknguyen on 27.07.17.
 */
/**
 This Lambda action record changes in lifecycle event of devices connected to Mitipi IOT
 Changes of 200ms period is avoided for duplicated events
 If there is change within 200ms period, prefer the 'connected' events
 **/

var AWS = require('aws-sdk')

let putLifeCycleEvent = function (event, docClient, context) {
  var params = {
    TableName: 'ClientLifeCycleEvents',
    Item: event
  }

  docClient.put(params, function (err, data) {
    if (err) {
      console.log('Error', err)
    } else {
      console.log('Success', data)
    }
    context.done()
  })
}

exports.handler = function (event, context, callback) {
  AWS.config.update({
    region: 'eu-central-1'
  })

  var docClient = new AWS.DynamoDB.DocumentClient()

  console.log('Querying for clientId: ' + event.clientId)

  var params = {
    TableName: 'ClientLifeCycleEvents',
    Key: {'clientId': event.clientId}
  }

  docClient.get(params, function (err, data) {
    if (err) {
      console.log('Error', err)
      context.done()
    } else {
      console.log('Success', data.Item)
      const MIN_PERIOD_FOR_STATUS_CHANGE = 200
      var previousTimestamp = data.Item.timestamp || 0
      console.log('previousTimestamp: ' + previousTimestamp)
      console.log('currentTimestamp: ' + event.timestamp)
      if (event.timestamp - previousTimestamp > MIN_PERIOD_FOR_STATUS_CHANGE) {
        putLifeCycleEvent(event, docClient, context)
      } else if (Math.abs(event.timestamp - previousTimestamp) < MIN_PERIOD_FOR_STATUS_CHANGE) {
        if (event.eventType === 'connected') {
          putLifeCycleEvent(event, docClient, context)
        }
      } else {
        console.log('Event in the past or duplicated (within 200ms)')
      }
    }
  })
}
