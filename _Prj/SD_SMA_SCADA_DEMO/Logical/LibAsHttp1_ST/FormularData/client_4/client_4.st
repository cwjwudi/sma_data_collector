(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer 
 ********************************************************************
 * Program: client_4
 * File: client_4.st
 * Author: Bernecker + Rainer
 * Created: February 16, 2012
 ********************************************************************
 * Implementation of program client_4
 ********************************************************************)

PROGRAM _INIT

	Ressource 				:= '/formdata.cgi';
	
	Client.method 			:= httpMETHOD_POST;
	Client.option 			:= httpOPTION_HTTP_11;
	
	Client.pHost 			:= ADR(Host);
	Client.pUri 			:= ADR(Ressource);
	Client.pResponseData 	:= ADR(Responsedata);
	Client.responseDataSize := SIZEOF(Responsedata);
	Client.pRequestData		:= ADR(Request);
	
END_PROGRAM

PROGRAM _CYCLIC
	
	IF Dosend = FALSE AND Doenable = TRUE THEN
		SetParam.enable := TRUE;
		Request 		:= '';
		SetParam.pDest 	:= ADR(Request);
		SetParam.destSize := SIZEOF(Request);
		SetParam.pParam := ADR('usertext1');
		SetParam.pValue := ADR(userText1);
		SetParam();
		
		SetParam.pParam := ADR('usertext2');
		SetParam.pValue := ADR(userText2);
		SetParam();
		Client.requestDataLen := SetParam.destLen;
	END_IF
	
	Client(enable := Doenable, send := Dosend); (* Call httpClient() *)
	
	(* TODO: Error handling *)
	
END_PROGRAM

PROGRAM _EXIT
	(* Release Client instance *)
	Client(enable := 0, send := 0);
END_PROGRAM