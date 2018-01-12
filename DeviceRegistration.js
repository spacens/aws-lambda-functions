/**
 * Created by lkknguyen on 27.07.17.
 */
/**
 This node.js Lambda function code creates and attaches an IoT policy to the certificate
 registered. It also activates the certificate. The Lambda function is attached as the rules engine action to
 the registration topic aws/events/certificates/registered/<caCertificateID>
 **/

var AWS = require('aws-sdk');
var region;
var iot;
// var iam;
var accountId;
var certificateARN;
var certificateId;
// var thingPolicy;
var cognitoUserId;
var deviceId;
var policyName;
var clientId;
const awsAccountId = '297893993926';

// Delay time tracking
var eventTime;

var config = {
  endpoint: 'am7i87ojp12bd.iot.eu-central-1.amazonaws.com',
  apiVersion: '2015-05-28'
};

exports.handler = function (event, context, callback) {
  console.log('Input data:', JSON.stringify(event));
  if (Object.keys(event).length === 0) {
    console.log('Empty input detected. Rejecting...');
    context.done();
    return;
  }

  const iotData = new AWS.IotData({endpoint: config.endpoint, apiVersion: '2015-05-28'});
  const client = event;

  // Step 1: Create the policy.
  // Step 2: Attach the policy to the certificate
  // Step 3: Activate the certificate.
  // Optionally, you can have your custom Certificate Revocation List (CRL) check logic here and
  // ACTIVATE the certificate only if it is not in the CRL .Revoke the certificate if it is in the CRL

  // Capture the event time & delay for Lambda execution
  let currentTime = (new Date()).getTime();
  eventTime = client.timestamp;
  let eventDelay = currentTime - eventTime;
  console.log('Lambda event delay: ' + eventDelay);

  // Replace it with the AWS region the lambda will be running in
  region = 'eu-central-1';

  // Get the AWS account ID
   accountId = awsAccountId;

  // Create the Iot object
  iot = new AWS.Iot({'region': region, apiVersion: '2015-05-28'});
  certificateId = client.certificateId.toString().trim();
  // iam = new AWS.IAM({'region': region});

  // Construct the ARN for the Thing certificate
  certificateARN = `arn:aws:iot:${region}:${accountId}:cert/${certificateId}`;

  // Construct PolicyName
  policyName = 'Device_' + client.deviceId + '_Policy';
  cognitoUserId = client.cognitoUserId;
  deviceId = client.deviceId;
  clientId = client.clientId;

  iotData.getThingShadow({ thingName: deviceId }, (err, data) => {
    // Create and attach the thingPolicy
    awsCreateSimplePolicy()
      .then(() => {
        const shadow = JSON.parse(data.payload);
        shadow.state.desired.client.confirmed = true;
        const params = {
          thingName: deviceId,
          payload: JSON.stringify(shadow)
        };

        iotData.updateThingShadow(params, (err, data) => {
          if (!err) {
            console.log('Update shadow successful');
            context.done();
          } else {
            console.log('Update shadow error:', err);
          }
        });
      })
      .catch(error => console.log('Device registration failed: ', error));
  });
};

function awsCreateSimplePolicy () {
  return new Promise((resolve, reject) => {
    // Step 1: Create the policy
    // Policy definition
    let policy = {
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
            `arn:aws:iot:${region}:${accountId}:*/${deviceId}/*`,
            `arn:aws:iot:${region}:${accountId}:$aws/events/presence/connected/${deviceId}`,
            `arn:aws:iot:${region}:${accountId}:$aws/events/presence/disconnected/${deviceId}`
          ]
        }
      ]
    };
    // Create the policy
    iot.createPolicy(
      {
        policyDocument: JSON.stringify(policy),
        policyName: policyName
      }, (err, data) => {
        // Log the delay for the createPolicy() callback
      let currentTime = (new Date()).getTime();
      let callbackDelay = currentTime - eventTime;
      console.log('awsCreatePolicy() Delay: ' + callbackDelay);

        // Ignore if the policy already exists
      if (err && (!err.code || err.code !== 'ResourceAlreadyExistsException')) {
        console.log(err);
        reject(err);
      }

      resolve();
    });
  }).then(() => {
    // Step 2: Attach the policy to the certificate
    return awsDetachOldAndAttachPolicyToNewCognitoUser();
  });
}

function awsAttachDevicePolicy () {
  return new Promise((resolve, reject) => {
    // Step 2: Attach the policy to the certificate
    // Attach policy to certificate
    iot.attachPrincipalPolicy(
      {
        policyName: policyName,
        principal: certificateARN
      }, (err, data) => {
        // Log the delay for the attachPrincipalPolicy() callback
      let currentTime = (new Date()).getTime();
      let callbackDelay = currentTime - eventTime;
      console.log('awsAttachPolicy() Delay: ' + callbackDelay);

        // Ignore if the policy is already attached
      if (err && (!err.code || err.code !== 'ResourceAlreadyExistsException')) {
        console.log('Failed to attach Policy to "Thing" certificate\n' + err);
        reject(err);
      }

      resolve();
    });
  }).then(() => {
    // We've attached the policy, now activate the certificate
    return awsActivateThing();
  });
}

function awsAttachCognitoUserPolicy () {
  return new Promise((resolve, reject) => {
    let params = {
      policyName: policyName,
      principal: cognitoUserId
    };

    console.log('Attaching IoT policy to Cognito principal');
    iot.attachPrincipalPolicy(params, (err, res) => {
      // Ignore if the policy is already attached
      if (err && (!err.code || err.code !== 'ResourceAlreadyExistsException')) {
        console.log('Failed to attach Policy to "Thing" certificate\n' + err);
        reject(err);
      }

      console.log('Attach cognito user policy succesful.')
      resolve();
    });
  });
}

function awsDetachOldAndAttachPolicyToNewCognitoUser () {
  return new Promise((resolve, reject) => {
    console.log('Deleting policy ' + policyName + ' from users');
    let params = {
      policyName: policyName, /* required */
      ascendingOrder: true
    };
    iot.listPolicyPrincipals(params, function (err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
        reject(err);
      } else { // successful response
        console.log('Successfully list previous users for policy: ', data.principals);
        console.log('Certificate: ', certificateARN);
        for (let principal of data.principals) {
          if (principal !== cognitoUserId && principal.startsWith(awsAccountId + ':')) {
            principal = principal.replace(awsAccountId + ':', '');
            console.log('Detaching policy: ', principal);
            iot.detachPrincipalPolicy({
              policyName: policyName,
              principal: principal
            }, (err, res) => {
              // Ignore if the policy is already attached
              if (err) {
                console.log('Failed to detach Policy from other cognito users\n', err);
                reject(err);
              } else {
                console.log('Successfully detached policy: ', res);
              }
            });
          }
        }

        resolve();
      }
    });
  }).then(() => awsAttachCognitoUserPolicy());
}

function awsActivateThing () {
  return new Promise((resolve, reject) => {
    // Step 3: Activate the certificate.
    // Optionally, you can have your custom Certificate Revocation List (CRL) check logic here and
    // ACTIVATE the certificate only if it is not in the CRL .Revoke the certificate if it is in the CRL
    iot.updateCertificate(
      {
        certificateId: certificateId,
        newStatus: 'ACTIVE'
      }, (err, data) => {
        // Log the delay for the updateCertificate() (activate) callback
      let currentTime = (new Date()).getTime();
      let callbackDelay = currentTime - eventTime;
      console.log('awsActivateThing() Delay: ' + callbackDelay);

      if (err) {
        console.log('Thing activation failed.');
        reject(err);
      } else {
        console.log('Thing activated successfully.');
        resolve();
      }
    });
  });
}