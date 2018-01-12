'use strict'

var AWS = require('aws-sdk')
var region
var iot
var accountId
var thingPolicy
var cognitoUserId
var policyName
const awsAccountId = '297893993926'

console.log('Loading function')

// Delay time tracking
var eventTime

/**
 * Add policy to the user
 */
exports.handler = function (event, context, callback) {
  // console.log('Received event:', JSON.stringify(event, null, 2))
  // console.log('Received context:', JSON.stringify(context, null, 2))

  cognitoUserId = context.identity.cognitoIdentityId;

  console.log('Received user:', JSON.stringify(cognitoUserId, null, 2))

  const done = (err, res) => callback(null, {
    statusCode: err ? '400' : '200',
    body: err ? err.message : JSON.stringify(res),
    headers: {
      'Content-Type': 'application/json'
    }
  })

  // Step 1: Create the policy.
  // Step 2: Attach the policy to the user

  // Capture the event time & delay for Lambda execution
  var currentTime = (new Date()).getTime()
  eventTime = event.timestamp
  var eventDelay = currentTime - eventTime
  console.log('Lambda event delay: ' + eventDelay)

  // Replace it with the AWS region the lambda will be running in
  region = 'eu-central-1'

  // Get the AWS account ID
  accountId = awsAccountId

  // Create the Iot object
  iot = new AWS.Iot({'region': region, apiVersion: '2015-05-28'})

  // Construct PolicyName
  policyName = 'User_' + cognitoUserId + '_Policy'
  policyName = policyName.replace(':', '_')

  // Create and attach the thingPolicy
  var err = awsCreateSimplePolicy()

  if (err) {
    done(err, {})
  } else {
    done(null, {})
  }
}

function awsCreateSimplePolicy () {
  // Step 1: Create the policy
  // Policy definition
  var policy = {
    'Version': '2012-10-17',
    'Statement': [

      {
        'Effect': 'Allow',
        'Action': [
          'iot:Connect'
        ],
        'Resource': [
          '*'
        ]
      },
      {
        'Effect': 'Allow',
        'Action': 'iot:*',
        'Resource': [
          `arn:aws:iot:${region}:${accountId}:*/${cognitoUserId}/*`
        ]
      }
    ]
  }
  // Create the policy
  iot.createPolicy(
    {
      policyDocument: JSON.stringify(policy),
      policyName: policyName
    }, (err, data) => {
      // Log the delay for the createPolicy() callback
    var currentTime = (new Date()).getTime()
    var callbackDelay = currentTime - eventTime
    console.log('awsCreatePolicy() Delay: ' + callbackDelay)

      // Ignore if the policy already exists
    if (err && (!err.code || err.code !== 'ResourceAlreadyExistsException')) {
      console.log(err)
      return err
    }
      // Set the thingPolicy to the return data
    thingPolicy = data

      // Step 2: Attach the policy to the certificate
    return awsDetachOldAndAttachPolicyToNewCognitoUser()
  })
}

function awsAttachCognitoUserPolicy () {
  let params = {
    policyName: policyName,
    principal: cognitoUserId
  }

  console.log('Attaching IoT policy to Cognito principal')
  iot.attachPrincipalPolicy(params, (err, res) => {
    // Ignore if the policy is already attached
    if (err && (!err.code || err.code !== 'ResourceAlreadyExistsException')) {
      console.log('Failed to attach Policy to "Thing" certificate\n' + err)
      return err
    } else {
      return null
    }
  })
}

function awsDetachOldAndAttachPolicyToNewCognitoUser () {
  console.log('Deleting policy ' + policyName + 'from users ')
  var params = {
    policyName: policyName, /* required */
    ascendingOrder: true
  }
  iot.listPolicyPrincipals(params, function (err, data) {
    if (err) console.log(err, err.stack) // an error occurred
    else { // successful response
      console.log('Successfully list previous users for policy' + data.principals)
      for (let principal of data.principals) {
        if (principal.startsWith('policy' + awsAccountId + ':')) {
          principal = principal.replace('policy' + awsAccountId + ':', '')
          iot.detachPrincipalPolicy({
            policyName: policyName,
            principal: principal
          }, (err, res) => {
            // Ignore if the policy is already attached
            if (err) {
              console.log('Failed to detach Policy from other cognito users\n' + err)
              return err
            }
          })
        }
      }
      return awsAttachCognitoUserPolicy()
    }
  })
}
