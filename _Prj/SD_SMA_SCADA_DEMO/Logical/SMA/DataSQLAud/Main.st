
PROGRAM _INIT
	AuditDataSQLQuery.Config.PointName[0] := 'AuditTime';
	AuditDataSQLQuery.Config.PointName[1] := 'AuditOperator';
	AuditDataSQLQuery.Config.PointName[2] := 'AuditText';
	bSimEnable := TRUE;
END_PROGRAM

PROGRAM _CYCLIC
	(*Fill AuditInsertBuffer arrays (AuditInsertBuffer_typ), then set InsertTrigger[i]*)
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	(*Fire parallel slots 0 / 10 / 49 when those triggers are idle*)
	tonAudit(IN := bSimEnable AND
		NOT AuditInsertBuffer.InsertTrigger[0] AND
		NOT AuditInsertBuffer.InsertTrigger[10] AND
		NOT AuditInsertBuffer.InsertTrigger[49],
		PT := T#10s);

	IF EDGEPOS(tonAudit.Q) THEN
		(*Index 0*)
		usiIdx := 0;
		diAuditIdx := RandRange(1, 9);
		strTmp := '';
		brsitoa(diAuditIdx, ADR(strTmp));
		AuditInsertBuffer.AuditTime[usiIdx] := dtNow;
		AuditInsertBuffer.AuditOperator[usiIdx] := 'Operator';
		brsstrcat(ADR(AuditInsertBuffer.AuditOperator[usiIdx]), ADR(strTmp));
		AuditInsertBuffer.AuditText[usiIdx] := 'SIM_AUDIT_EVENT_';
		brsstrcat(ADR(AuditInsertBuffer.AuditText[usiIdx]), ADR(strTmp));
		AuditInsertBuffer.AuditBatch[usiIdx] := gDataSQLBatch.BatchCode;
		AuditInsertBuffer.InsertTrigger[usiIdx] := TRUE;

		(*Index 10*)
		usiIdx := 10;
		diAuditIdx := RandRange(1, 9);
		strTmp := '';
		brsitoa(diAuditIdx, ADR(strTmp));
		AuditInsertBuffer.AuditTime[usiIdx] := dtNow;
		AuditInsertBuffer.AuditOperator[usiIdx] := 'Operator';
		brsstrcat(ADR(AuditInsertBuffer.AuditOperator[usiIdx]), ADR(strTmp));
		AuditInsertBuffer.AuditText[usiIdx] := 'SIM_AUDIT_EVENT_';
		brsstrcat(ADR(AuditInsertBuffer.AuditText[usiIdx]), ADR(strTmp));
		AuditInsertBuffer.AuditBatch[usiIdx] := gDataSQLBatch.BatchCode;
		AuditInsertBuffer.InsertTrigger[usiIdx] := TRUE;

		(*Index 49*)
		usiIdx := 49;
		diAuditIdx := RandRange(1, 9);
		strTmp := '';
		brsitoa(diAuditIdx, ADR(strTmp));
		AuditInsertBuffer.AuditTime[usiIdx] := dtNow;
		AuditInsertBuffer.AuditOperator[usiIdx] := 'Operator';
		brsstrcat(ADR(AuditInsertBuffer.AuditOperator[usiIdx]), ADR(strTmp));
		AuditInsertBuffer.AuditText[usiIdx] := 'SIM_AUDIT_EVENT_';
		brsstrcat(ADR(AuditInsertBuffer.AuditText[usiIdx]), ADR(strTmp));
		AuditInsertBuffer.AuditBatch[usiIdx] := gDataSQLBatch.BatchCode;
		AuditInsertBuffer.InsertTrigger[usiIdx] := TRUE;
	END_IF
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
