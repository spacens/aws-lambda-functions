'use strict';

const aws = require('aws-sdk');

const ACTIVITY_EXTENSION = '.activity';

var FileHelper = {
    fileName: function(fileName, extension = '.'){
        return fileName.substring(0, fileName.indexOf(extension))
    }
}

function ActivityDataS3ReadCallback(data, fileName) {
    let inputData = JSON.parse(data);
    inputData.file_name = fileName;

    //ACTIVITY
    function Activity(data) {
        const ACTIVITY_TABLE = "Activities";

        let activityDB = new DynamoDbAdapter(ACTIVITY_TABLE, activityParams(data));

        return activityDB;
    }

    function activityParams(data) {
        let attributes = data.attributes;
        delete data.attributes;

        return Object.assign(data, attributes); // Method for changing structure in the future. (BTW: We know about YAGNI principle)
    }

    // AUDIO TODO: separate if this is possible
    function Audio(data, activityId) {
        const AUDIO_TABLE = "Audios";

        let audioDB = new DynamoDbAdapter(AUDIO_TABLE, audioParams(data));

        return audioDB;
    }

    function audioParams(data) {
        return {
            name: data.fileName,
            activity_file_name: data.file_name
        }
    }

    // VISUAL TODO: separate if this is possible
    function Visual(data, activityId) {
        const VISUAL_TABLE = "Visuals";

        let visualDB = new DynamoDbAdapter(VISUAL_TABLE, visualParams(data));

        return visualDB;
    }

    function visualParams(data) {
        return {
            name: data.fileName,
            activity_file_name: data.file_name
        }
    }

    function saveReadData() {
        if (!correctInputformat()) {
            return console.log("Incorrect input json file!!! Your data must include 'content' and 'attributes' keys");
        }

        let activity_file_name = FileHelper.fileName(inputData.file_name, ACTIVITY_EXTENSION),
            activity = new Activity(Object.assign(inputData, { file_name: activity_file_name }));
        activity.save();
    }

    function correctInputformat() {
        return inputData.attributes && inputData.content;
    }

    return saveReadData();
}

var S3DataBuilder = {
    _s3Client: null,
    s3Client: function() {
        if (S3DataBuilder._s3Client === null) {
            S3DataBuilder._s3Client = new aws.S3();
        }
        return S3DataBuilder._s3Client;
    },

    writeDataToDynamoDb: function(S3event) {
        S3event.Records.forEach(record => {
           S3DataBuilder.readDataFromS3Record(record, ActivityDataS3ReadCallback);
        });
    },

    readDataFromS3Record: function(record, readDataCallback) { //   readDataCallback(data, file_name)
        let params = {
                Bucket: record.s3.bucket.name,
                Key: record.s3.object.key
            };

            S3DataBuilder.s3Client().getObject(params, (err, data) => {
                if (err) {
                    return console.log(err);
                }
                else {
                    readDataCallback(data.Body.toString(), params.Key);
                }
            });
    },

    _readDataErrorsCallback: function(err, data) {
        if (err) {
          console.log(err);
        }
    }
};

var DynamoDbWriter = {
    _dynamoDBClient: null,
    dynamoDBClient: function() {
        if (DynamoDbWriter._dynamoDBClient === null) {
            DynamoDbWriter._dynamoDBClient = new aws.DynamoDB.DocumentClient();
        }
        return DynamoDbWriter._dynamoDBClient;
    },

    writeCallback: function(err, data, eventMessage = "Added item:") {
        if (err) {
            console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            console.log(eventMessage, JSON.stringify(data, null, 2));
        }
    },

    writeData: function(data, tableName, callback = DynamoDbWriter.writeCallback) {
        const dynamoDbParams = {
            TableName: tableName,
            Item: data
        };

        DynamoDbWriter.dynamoDBClient().put(dynamoDbParams, DynamoDbWriter.writeCallback);
    },

    updateData: function(data, tableName, callback = DynamoDbWriter.writeCallback) {
        console.log(data);
        const dynamoDbParams = {
            TableName: tableName,
            Key: {file_name: data.file_name},
            ReturnValues:"UPDATED_NEW",
            ExpressionAttributeValues: { ":file_name": data.file_name },
        };

        DynamoDbWriter.dynamoDBClient().update(dynamoDbParams, (err, data) =>
            { DynamoDbWriter.writeCallback(err, data, "Updated item:") } );
    }

};

function DynamoDbAdapter(tableName, params) {
    this.tableName = tableName;
    this.errors = [];
    this.params =  params;
    this.object = null;
}
DynamoDbAdapter.prototype.save = function() {
    DynamoDbWriter.writeData(this.params, this.tableName, (err, data) => {
       if(err) {
           this.errors.push(err);
       }
       else {
          this.object = data;
       }
    });
};
DynamoDbAdapter.prototype.valid = function() {
    this.errors.length > 0;
};

exports.handler = (event, context, callback) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));
   S3DataBuilder.writeDataToDynamoDb(event)
};
