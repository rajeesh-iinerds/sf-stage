/**
 * @author Rajeesh <rajeesh.k@iinerds.com>
 * @version: 0.3
 */

'use strict'

const jsonQuery = require('json-query');
var AWS = require('aws-sdk');

/**
 * Define AWS API version
 */

AWS.config.apiVersions = {
  cloudformation: '2010-05-15',
  // other service API versions
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var apigateway = new AWS.APIGateway();
var lammbda = new AWS.Lambda();
var stepfunctions = new AWS.StepFunctions;

// Lambda handler starts here.
exports.handler = function(event, context, callback) {

    //Retrieve the CodePipeline ID 
    var jobId = event["CodePipeline.job"].id;

    /**
     * Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
     * health checked by this function.
     */
    var stackName = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters; 

    // Define the Cloudformation stack parameters. The processed CF template need to be used.     
    var stackParams = {
        StackName: stackName || '',
        TemplateStage: 'Processed'
    };

    // REST Api Id of the deployed API.
    var restApiIdVal;

    // Define the Success function.
    var putJobSuccess = function(message) {
      
        var cpParams = {
            jobId: jobId
        };

        console.log("Job Id: ", jobId);
    
        // CodePipeline Success method.
        codepipeline.putJobSuccessResult(cpParams, function(err, data) {
            if (err) {
                callback(err);
            }
            else {
                cloudformation.getTemplate(stackParams, function(err, data) {
                    if (err) { 
                        console.log(err, err.stack);
                    }
                    else {
                        console.log(data);

                        var templateBody = data.TemplateBody; // template body.
                        var jsonTemplate = JSON.parse(templateBody);
                        // Retreive the API Name
                        var restApiName = jsonTemplate.Resources.CCTApi.Properties.Name;
                        
                        // Define the API List parameters. 
                        var apiListParams = {
                            limit: 20,   
                        };
                       
                        // Retrieve All the API and then pass the Restapiid to retrieve the correct API.
                        apigateway.getRestApis(apiListParams, function(err, data) {
                            if (err) {
                                //console.log(err, err.stack) 
                            }    
                            else {
                                //console.log(data); 
                                var currentApiData = jsonQuery('items[name=' + restApiName+ '].id', {
                                    data: data
                                }) 

                                restApiIdVal = currentApiData.value;

                                var apiParams = {
                                    "apiId" : restApiIdVal
                                };
                                
                                console.log("Rest API Id: ", restApiIdVal);
                                /**
                                 * Define StepFunction Parameters.
                                 */
                                var apiSFParams = {
                                    stateMachineArn: 'arn:aws:states:us-east-2:902849442700:stateMachine:WaitStage',
                                    input: JSON.stringify(apiParams)
                                };

                                /**
                                 * Start the StepFunction execution.
                                 */
                                stepfunctions.startExecution(apiSFParams, function(err, data) {
                                    if (err) {
                                        console.log(err, err.stack); // an error occurred
                                    } 
                                    else {
                                        console.log(data); // successful response 
                                        /**
                                         * Get the ARN of STepFunction Execution and define the Params
                                         */
                                        var getSFExecutionArn = data.executionArn;
                                        var sfExecutionParams = {
                                            executionArn: getSFExecutionArn /* required */
                                        };
                                        
                                        /**
                                         * Check the status of Stepfunction.
                                         */
                                        stepfunctions.describeExecution(sfExecutionParams, function(err, data) {
                                            if (err) {
                                                console.log(err, err.stack); // an error occurred
                                            }        
                                            else {    
                                                console.log(data); // successful response
                                                /**
                                                 * Return only if the StepFunction completed successfully.
                                                 * Generally, it will in the RUNNING "status".
                                                 */
                                                if (data.status === 'SUCCEEDED') {
                                                    callback(null, message);
                                                }
                                            }    
                                        });
                                    }    
                                });
                            }    
                        });
                    }
                });
               
            }    
        });    
    }    

    // Notify AWS CodePipeline of a failed job
    var putJobFailure = function(message) {
        var params = {
            jobId: jobId,
            failureDetails: {
                message: JSON.stringify(message),
                type: 'JobFailed',
                externalExecutionId: context.invokeid
            }
        };
        codepipeline.putJobFailureResult(params, function(err, data) {
            context.fail(message);      
        });
    };

    // Validate the URL passed in UserParameters
    if(!stackName) {
        putJobFailure('The UserParameters field must contain the Stack Name!');  
        return;
    }
    putJobSuccess('Success');
};