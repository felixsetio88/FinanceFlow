import React, { useState, useRef, useEffect } from 'react';
import { TextInput } from 'react-native';

const FastInput = ({ value, onChangeText, ...props }) => {
    const [local, setLocal] = useState(String(value || ''));
    const typing = useRef(false);

    useEffect(() => {
        if (!typing.current && String(value || '') !== local) {
            setLocal(String(value || ''));
        }
    }, [value]);

    return (
        <TextInput
            {...props}
            value={local}
            onChangeText={t => {
                typing.current = true;
                setLocal(t);
                if (onChangeText) {
                    requestAnimationFrame(() => {
                        onChangeText(t);
                        setTimeout(() => {
                            typing.current = false;
                        }, 100);
                    });
                } else {
                    typing.current = false;
                }
            }}
        />
    );
};

export default FastInput;
