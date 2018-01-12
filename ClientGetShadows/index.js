/**
 * Created by lkknguyen on 27.07.17.
 */
/**
 This node.js Lambda function code creates and attaches an IoT policy to the certificate
 registered. It also activates the certificate. The Lambda function is attached as the rules engine action to
 the registration topic aws/events/certificates/registered/<caCertificateID>
 **/

var AWS = require('aws-sdk')
var iot
const AWS_IOT_ENDPOINT_HOST = 'am7i87ojp12bd.iot.eu-central-1.amazonaws.com'
var async = require('async')

exports.handler = function (event, context, callback) {
  AWS.config.update({
    region: 'eu-central-1'
  })
  // Create the Iot object
  iot = new AWS.IotData({endpoint: AWS_IOT_ENDPOINT_HOST, apiVersion: '2015-05-28'})

  var docClient = new AWS.DynamoDB.DocumentClient()

  console.log('Querying for cognitoUserId: ' + event.cognitoUserId)

  var params = {
    TableName: 'MitipiDevices',
    IndexName: 'cognitoUserId-index',
    KeyConditionExpression: 'cognitoUserId = :cognitoUserId',
    ExpressionAttributeValues: {
      ':cognitoUserId': event.cognitoUserId
    }
  }

  docClient.query(params, function (err, data) {
    var result = {}
    if (err) {
      console.error('Unable to query. Error:', JSON.stringify(err, null, 2))
      result = {errorCode: 100, errorMessage: JSON.stringify(err, null, 2)}
      var params = {
        topic: `clients/${event.cognitoUserId}/things/shadow/get/rejected`, /* required */
        payload: Buffer.from(JSON.stringify(result)) || '{}',
        qos: 1
      }
      iot.publish(params, function (err, data) {
        if (err) console.log(err, err.stack) // an error occurred
        else console.log(data)           // successful response
      })
    } else {
      console.log('Query succeeded.')

      async.map(data.Items, function (item, callback) {
        console.log(' -', item.serialNumber + ': ' + item.cognitoUserId)
        var params = {
          thingName: item.serialNumber /* required */
        }
        iot.getThingShadow(params, function (err, res) {
          if (err) console.log(err, err.stack) // an error occurred
          else {
            var shadow = JSON.parse(res.payload)
            result[item.serialNumber] = shadow
            console.log(item.serialNumber + ': ' + res)
            callback(null, shadow)
          }
        })
      },
      function (err, results) {
        if (err) console.log(err)
        else {
          // results is now an array of shadows
          console.log('Shadows: ' + JSON.stringify(result, null, 2))           // successful response
          var params = {
            topic: `clients/${event.cognitoUserId}/things/shadow/get/accepted`, /* required */
            payload: Buffer.from(JSON.stringify(result)) || '{}',
            qos: 1
          }
          iot.publish(params, function (err, data) {
            if (err) console.log(err, err.stack) // an error occurred
            else console.log(data)           // successful response
            context.done()
          })
        }
      })
    }
  })
}
