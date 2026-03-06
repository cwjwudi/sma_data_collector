(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer
 ********************************************************************
 * Program: service_1
 * File: service_1.st
 * Author: Bernecker + Rainer
 * Created: February 16, 2012
 ********************************************************************
 * Implementation of program service_1
 ********************************************************************)

PROGRAM _INIT



	
	Webservice.pServiceName 	:= ADR('helloworld.cgi'); (* Name of webservice *)
	Webservice.option 			:= httpOPTION_HTTP_10 + httpOPTION_SERVICE_TYPE_NAME;
	
	Response 					:= 'Hello client'; 
	Webservice.pResponseData 	:= ADR(Response);
	Webservice.responseDataLen 	:= strlen(ADR(Response));
	
	(* Register Webservice*)
	Webservice(enable := 1);

END_PROGRAM


PROGRAM _CYCLIC
	
	IF  Webservice.send = TRUE  THEN 
		Webservice.send := FALSE; (* Reset *)
	ELSIF Webservice.status = ERR_OK AND Webservice.send = FALSE THEN 
		(* Create Response *)		
		Webservice.responseDataLen := strlen(ADR(Response));
		Webservice.send := TRUE; (* Send on positive edge*)
	END_IF
	
	Webservice();
END_PROGRAM


PROGRAM _EXIT

	(* Unregister Webservice *)
	Webservice(enable := 0);
	
END_PROGRAM