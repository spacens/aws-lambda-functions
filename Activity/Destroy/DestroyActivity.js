'use strict';

const aws = require('aws-sdk');

const ACTIVITY_EXTENSION = '.activity';

var FileHelper = {
    fileName: function(file_name, extension = '.'){
        return file_name.substring(0, file_name.indexOf(extension))
    }
}

function ActivityDataS3DestroyCallback(fileName) {
    let inputData = { file_name: FileHelper.fileName(fileName, ACTIVITY_EXTENSION) };

    //ACTIVITY
    function Activity(data) {
        const ACTIVITY_TABLE = "Activities";

        let activityDB = new DynamoDbAdapter(ACTIVITY_TABLE, data);

        return activityDB;
    }

    function destroyData() {
        let activity = new Activity({ file_name: inputData.file_name });
        activity.destroy();
    }

    return destroyData();
}

var S3DataBuilder = {
    _s3Client: null,
    s3Client: function() {
        if (S3DataBuilder._s3Client === null) {
            S3DataBuilder._s3Client = new aws.S3();
        }
        return S3DataBuilder._s3Client;
    },

    deleteDataFromDynamoDb: function(S3event) {
        S3event.Records.forEach(record => {
           new ActivityDataS3DestroyCallback(record.s3.object.key);
        });
    }
};

var DynamoDb = {
    _dynamoDBClient: null,
    dynamoDBClient: function() {
        if (DynamoDb._dynamoDBClient === null) {
            DynamoDb._dynamoDBClient = new aws.DynamoDB.DocumentClient();
        }
        return DynamoDb._dynamoDBClient;
    },

    destroyCallback: function(err, data) {
        if (err) {
            console.error("Unable to destroy item. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            console.log("Destroy item:", JSON.stringify(data, null, 2));
        }
    },

    destroyData: function(data, tableName, callback = DynamoDb.destroyCallback) {
        const dynamoDbParams = {
            TableName: tableName,
            Key: data
        };

        DynamoDb.dynamoDBClient().delete(dynamoDbParams, callback);
    }

};

function DynamoDbAdapter(tableName, params) {
    this.tableName = tableName;
    this.errors = [];
    this.params =  params;
    this.object = null;
}
DynamoDbAdapter.prototype.destroy = function() {
    DynamoDb.destroyData(this.params, this.tableName, (err, data) => {
       if(err) {
           console.error("Unable to destroy item. Error JSON:", JSON.stringify(err, null, 2));
           this.errors.push(err);
       }
       else {
            console.log("Destroy itme:", JSON.stringify(data, null, 2));
            this.object = data;
       }
    });
};


exports.handler = (event, context, callback) => {
    // console.log('Received event:', JSON.stringify(event, null, 2));
  S3DataBuilder.deleteDataFromDynamoDb(event)
};
