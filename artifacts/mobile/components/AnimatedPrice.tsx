import React, { useEffect, useRef } from "react";
import { StyleProp, StyleSheet, TextStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface Props {
  price: number;
  format?: (p: number) => string;
  style?: StyleProp<TextStyle>;
  prefix?: string;
}

export function AnimatedPrice({ price, format, style, prefix = "" }: Props) {
  const prevRef = useRef(price);
  const isUpRef = useRef(true);
  const flash = useSharedValue(0);

  useEffect(() => {
    if (price !== prevRef.current) {
      isUpRef.current = price > prevRef.current;
      prevRef.current = price;
      flash.value = withSequence(
        withTiming(1, { duration: 80 }),
        withDelay(300, withTiming(0, { duration: 400 }))
      );
    }
  }, [price]);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor:
      flash.value > 0
        ? isUpRef.current
          ? `rgba(34,197,94,${flash.value * 0.35})`
          : `rgba(232,21,21,${flash.value * 0.35})`
        : "transparent",
  }));

  const priceStr = format ? format(price) : price.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <Animated.Text style={[styles.price, style, animStyle]}>
      {prefix}{priceStr}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  price: { fontSize: 15, fontWeight: "700", borderRadius: 3, paddingHorizontal: 2 },
});
