(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer 
 ********************************************************************
 * Program: service_3
 * File: service_3.st
 * Author: Bernecker + Rainer
 * Created: February 17, 2012
 ********************************************************************
 * Implementation of program service_3
 ********************************************************************)

PROGRAM _INIT

	Webservice.pServiceName 			:= ADR('Proxy.cgi'); (* Name of webservice *)
	Webservice.option 					:= httpOPTION_HTTP_10 + httpOPTION_SERVICE_TYPE_NAME;

	Webservice.pResponseData 			:= ADR(Response);
	
	Webservice.pRequestHeader 			:= ADR(RequestHeader);
	RequestHeader.rawHeader.pData 		:= ADR(RequestRawHeader);
	RequestHeader.rawHeader.dataSize 	:= SIZEOF(RequestRawHeader);
	
	(* Register Webservice*)
	Webservice(enable := 1);
END_PROGRAM


PROGRAM _CYCLIC

	IF (Webservice.send = TRUE) THEN 
		Webservice.send := FALSE; (* Reset *)
	ELSIF (Webservice.status = ERR_OK) AND (Webservice.send = FALSE) THEN  
		(* Create Response *)
		strcpy(ADR(Response) , ADR('Some Data.'));
		Webservice.responseDataLen := strlen(ADR(Response)); (* Length of the response *)
		Webservice.send := TRUE; (* Send on positive edge*)
	END_IF
	
	Webservice();
END_PROGRAM


PROGRAM _EXIT

	(* Unregister Webservice *)
	Webservice(enable := 0);

END_PROGRAM