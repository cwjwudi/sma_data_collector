(******************************************************************************
 * B&R AsHttp Library - POST JSON Data Example
 * Description: Send PLC data to HTTP server in JSON format
 * Library: AsHttp
 ******************************************************************************)

PROGRAM _INIT
    
    (* Initialize HTTP client *)
	httpClient_0.enable := TRUE;
	httpClient_0.pHost := ADR('127.0.0.1');  (* Server IP address *)
	httpClient_0.hostPort := 8000;               (* Server port *)
    
	(* Initialize state machine *)
	step := 0;
	sendTimer := 0;
	dataIndex := 0;
    
END_PROGRAM

PROGRAM _CYCLIC
    
    
	CASE step OF
        
		(* Step 0: Wait and prepare data *)
		0:
			sendTimer := sendTimer + 1;
			IF sendTimer >= 500 THEN  (* Send every 500ms (assuming 1ms cycle) *)
				sendTimer := 0;
                
                
				(* Get PLC variable value *)
				brsmemcpy(ADR(currentValue),ADR(PLCVariable),SIZEOF(PLCVariable));
                
				(* Build JSON string *)
				(* Format: [[timestamp1, value1], [timestamp2, value2], ...] *)
                
				(* For single point: *)
				jsonLength := BuildSinglePointJSON(
				ADR(jsonBuffer),
				SIZEOF(jsonBuffer),
				currentTimestamp,
				currentValue
				);
                
				step := 1;
			END_IF
            
			(* Step 1: Send POST request *)
		1:
			httpClient_0.send := TRUE;
			httpClient_0.pUri := ADR('/api/data');
			httpClient_0.pRequestHeader := ADR(requestHeader);
			httpClient_0.pRequestData := ADR(jsonBuffer);
			httpClient_0.requestDataLen := jsonLength;
			httpClient_0.httpMethod := httpMETHOD_POST;
            
			IF httpClient_0.status = 0 THEN
				step := 2;
			ELSIF httpClient_0.status < 0 THEN
				(* Error handling *)
				errorCode := httpClient_0.status;
				step := 10;
			END_IF
            
			(* Step 2: Wait for response *)
		2:
			httpClient_0.send := FALSE;
            
			IF httpClient_0.responseDataLen > 0 THEN
				(* Response received *)
				responseCode := httpClient_0.responseCode;
				step := 0;
			ELSIF httpClient_0.status < 0 THEN
				errorCode := httpClient_0.status;
				step := 10;
			END_IF
            
			(* Step 10: Error state *)
		10:
			(* Wait and retry *)
			sendTimer := sendTimer + 1;
			IF sendTimer >= 5000 THEN
				sendTimer := 0;
				step := 0;
			END_IF
            
	END_CASE
	
	(* Call HTTP client function block *)
	httpClient_0();

END_PROGRAM