(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer 
 ********************************************************************
 * Program: Client_2
 * File: Client_2.st
 * Author: Bernecker + Rainer
 * Created: February 17, 2012
 ********************************************************************
 * Implementation of program Client_2
 ********************************************************************)


PROGRAM _INIT
	(* Fiddler is a HTTP Proxy for HTTP diagnostics http://www.fiddler2.com/fiddler2/ *) 
	
	(* Proxy specific *)
	Client.pHost 			:= ADR(Proxy); 		(* Host to connect to: Proxy*)
	Client.hostPort 		:= Proxyport;  		(* Port of the proxy *)
	
	Requestheader.host 		:= Host;			(* Required field in HTTP/1.1. Normally generated 
													automaticly using "Client.pHost". When a proxy 
													is used, this field should be set explictly. *)
	Client.pRequestHeader 	:= ADR(Requestheader); 
	
	Ressource				:= 'http://'; 		(* Communication over a proxy requires full request path. *)
	strcat(ADR(Ressource), ADR(Host)); 
	(* Not proxy specific *)
	strcat(ADR(Ressource), ADR('/Proxy.cgi'));	(* Name of file or webservice to be requested *)
	Client.pUri 			:= ADR(Ressource);
	Client.method 			:= httpMETHOD_GET;	(* Request method *)
	Client.option 			:= httpOPTION_HTTP_11; 
	
	Client.pResponseData 	:= ADR(Responsedata); 
	Client.responseDataSize := SIZEOF(Responsedata);
		
END_PROGRAM


PROGRAM _CYCLIC

	IF Doenable = FALSE THEN 
		_Connectioninformation 	:= 'FUB disabled';  	
		Client.pHost 			:= ADR(Proxy); 		(* Host to connect to: Proxy*)
		Client.hostPort 		:= Proxyport;  		(* Port of the proxy *)
	
		Requestheader.host 		:= Host;			(* Required field in HTTP/1.1. Normally generated 
													automaticly using "Client.pHost". When a proxy 
													is used, this field should be set explictly. *)
		
	ELSIF Dosend = FALSE THEN
		_Connectioninformation 	:= 'Dosend set to false';  	 	(* Reset message *)
	ELSIF Client.status = httpERR_CLIENT_TCP_INVALID_HOST OR Client.status = httpERR_CLIENT_TCP_CONN_FAILED THEN
		(* Check proxy configuration and availability *)
		_Connectioninformation 	:= 'Could not connect: Check proxy configuration and availability';
	ELSIF Client.status = ERR_OK OR Client.status = httpERR_CLIENT_TCP_CONN_CLOSED THEN
		_Connectioninformation 	:= '';  				(* Reset message *)
	END_IF
		
	mylen := strlen(ADR(Responsedata));
	
	Client(enable := Doenable, send := Dosend); 	(* Call httpClient() *)
	(* TODO: Error handling *)	
END_PROGRAM


PROGRAM _EXIT
	Client(enable := 0, send := 0);			(* Release Client instance *)
END_PROGRAM